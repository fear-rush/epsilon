/**
 * Registry data into install options, with no I/O. A registry describes how a
 * server runs (a package and its arguments, or a remote URL); the options here
 * are the `mcp.json` entries those descriptions mean, with a `{key}` placeholder
 * wherever the person has to supply a value. The spec has no `command`, so it is
 * derived from the package type.
 */
import type {
	InstallOption,
	RegistryDetail,
	RegistryEntry,
	RegistryInput,
	RegistryItem,
	RegistrySource,
} from "./contract";
import type {
	GithubArgument,
	GithubServer,
	GithubValue,
	OfficialArgument,
	OfficialPackage,
	OfficialRemote,
	OfficialServer,
	OfficialValue,
} from "./upstream";

type Variables = OfficialValue["variables"];

/** What every env variable, header and argument of the spec has in common. */
type ValueLike = {
	description?: string | undefined;
	isRequired?: boolean | null | undefined;
	isSecret?: boolean | null | undefined;
	default?: string | undefined;
	value?: string | undefined;
	choices?: string[] | null | undefined;
	variables?: Variables;
};

type Target = RegistryInput["target"];

const NO_SSE = "pi doesn't speak legacy SSE";
const PLACEHOLDER = /\{([A-Za-z0-9_.-]+)\}/g;

/** Collects the inputs while an entry is built; the same key is asked for once. */
class Inputs {
	readonly list: RegistryInput[] = [];

	add(input: RegistryInput): void {
		if (!this.list.some((existing) => existing.key === input.key)) this.list.push(input);
	}
}

const inputKey = (target: Target, name: string) => `${target}:${name}`;

const inputOf = (target: Target, name: string, item: ValueLike): RegistryInput => {
	const input: RegistryInput = {
		key: inputKey(target, name),
		target,
		name,
		required: item.isRequired === true,
		secret: item.isSecret === true,
	};
	if (item.description !== undefined && item.description !== "")
		input.description = item.description;
	if (item.default !== undefined && item.default !== "") input.default = item.default;
	if (item.choices !== undefined && item.choices !== null && item.choices.length > 0) {
		input.choices = item.choices;
	}
	return input;
};

/**
 * A template with its `{variable}` names turned into placeholders of this target.
 * A variable the registry did not describe is required, and secret in a header or
 * an environment variable, where a token is what it most likely stands for.
 */
function fill(template: string, variables: Variables, target: Target, inputs: Inputs): string {
	return template.replace(PLACEHOLDER, (_match, name: string) => {
		const described = variables?.[name];
		const item: ValueLike = described ?? {
			isRequired: true,
			isSecret: target === "header" || target === "env",
		};
		inputs.add(inputOf(target, name, item));
		return `{${inputKey(target, name)}}`;
	});
}

/**
 * The value an item has in the entry: its own, its placeholder when the person
 * has to supply it (required or secret), its default, or nothing at all.
 */
function resolve(
	item: ValueLike,
	target: Target,
	name: string,
	inputs: Inputs,
): string | undefined {
	if (item.value !== undefined && item.value !== "") {
		return fill(item.value, item.variables, target, inputs);
	}
	if (item.isRequired === true || item.isSecret === true) {
		inputs.add(inputOf(target, name, item));
		return `{${inputKey(target, name)}}`;
	}
	return item.default !== undefined && item.default !== "" ? item.default : undefined;
}

/** `--name value` for a named argument, the value for a positional one. */
function argumentsOf(
	list: readonly OfficialArgument[] | null | undefined,
	inputs: Inputs,
): string[] {
	return (list ?? []).flatMap((argument, index) => {
		const name = argument.name ?? undefined;
		const label = name ?? argument.valueHint ?? `argument ${index + 1}`;
		const value = resolve(argument, "arg", label, inputs);
		if (argument.type === "named") {
			if (name === undefined) return [];
			return value === undefined ? [] : [name, value];
		}
		return value === undefined ? [] : [value];
	});
}

function environmentOf(list: readonly OfficialValue[] | null | undefined, inputs: Inputs) {
	return Object.fromEntries(
		(list ?? []).flatMap((variable): [string, string][] => {
			const value = resolve(variable, "env", variable.name, inputs);
			return value === undefined ? [] : [[variable.name, value]];
		}),
	);
}

const unsupported = (id: string, label: string, reason: string): InstallOption => ({
	id,
	label,
	supported: false,
	reason,
	inputs: [],
});

const PACKAGE_REASONS = new Map([
	["nuget", "NuGet packages are not supported"],
	["cargo", "Cargo packages are not supported"],
	["mcpb", "MCPB bundles are not supported"],
]);

const packageLabel = (pkg: OfficialPackage): string => {
	const version = pkg.version ?? "";
	return `${pkg.registryType} · ${pkg.identifier}${version === "" ? "" : ` ${version}`}`;
};

/** An image reference already names its tag or digest when it has one after the last slash. */
const imageOf = (identifier: string, version: string | undefined): string => {
	const last = identifier.slice(identifier.lastIndexOf("/") + 1);
	if (version === undefined || version === "" || last.includes(":") || last.includes("@")) {
		return identifier;
	}
	return `${identifier}:${version}`;
};

function packageOption(pkg: OfficialPackage, index: number): InstallOption {
	const id = `package:${index}`;
	const label = packageLabel(pkg);
	const type = pkg.registryType.toLowerCase();
	const reason = PACKAGE_REASONS.get(type);
	if (reason !== undefined) return unsupported(id, label, reason);
	if (type !== "npm" && type !== "pypi" && type !== "oci") {
		return unsupported(id, label, `${pkg.registryType} packages are not supported`);
	}
	const transport = pkg.transport?.type ?? "stdio";
	if (transport !== "stdio") {
		return unsupported(id, label, `Runs as a ${transport} server that you start yourself`);
	}

	const inputs = new Inputs();
	const env = environmentOf(pkg.environmentVariables, inputs);
	const runtime = argumentsOf(pkg.runtimeArguments, inputs);
	const rest = argumentsOf(pkg.packageArguments, inputs);
	const version = pkg.version ?? "";

	let command: string;
	let args: string[];
	if (type === "npm") {
		command = pkg.runtimeHint ?? "npx";
		const target = version === "" ? pkg.identifier : `${pkg.identifier}@${version}`;
		args = [...(command === "npx" ? ["-y"] : []), ...runtime, target, ...rest];
	} else if (type === "pypi") {
		command = pkg.runtimeHint ?? "uvx";
		const target = version === "" ? pkg.identifier : `${pkg.identifier}==${version}`;
		args = [...runtime, target, ...rest];
	} else {
		command = pkg.runtimeHint ?? "docker";
		args = [
			"run",
			"-i",
			"--rm",
			...Object.keys(env).flatMap((name) => ["-e", name]),
			...runtime,
			imageOf(pkg.identifier, version),
			...rest,
		];
	}
	const entry: RegistryEntry = { transport: "stdio", command, args, env };
	return { id, label, supported: true, entry, inputs: inputs.list };
}

function remoteOption(remote: OfficialRemote, index: number): InstallOption {
	const id = `remote:${index}`;
	const label = `Remote · ${remote.url}`;
	const type = remote.type.toLowerCase();
	if (type === "sse") return unsupported(id, label, NO_SSE);
	if (type !== "streamable-http") {
		return unsupported(id, label, `The ${remote.type} transport is not supported`);
	}
	const inputs = new Inputs();
	const url = fill(remote.url, remote.variables, "url", inputs);
	const headers: Record<string, string> = {};
	for (const header of remote.headers ?? []) {
		const value = resolve(header, "header", header.name, inputs);
		if (value !== undefined) headers[header.name] = value;
	}
	const entry: RegistryEntry = { transport: "http", url, headers };
	return { id, label, supported: true, entry, inputs: inputs.list };
}

/** Packages first, then remotes, in the order the registry lists them. */
export function optionsOf(server: OfficialServer): InstallOption[] {
	return [
		...(server.packages ?? []).map(packageOption),
		...(server.remotes ?? []).map(remoteOption),
	];
}

/** The package types a server ships as, and `remote` when it also has a URL. */
export function kindsOf(server: OfficialServer): string[] {
	const kinds = (server.packages ?? []).map((pkg) => pkg.registryType.toLowerCase());
	if ((server.remotes ?? []).length > 0) kinds.push("remote");
	return [...new Set(kinds)];
}

const repositoryOf = (server: OfficialServer): string | undefined => {
	const url = server.repository?.url ?? server.websiteUrl;
	return url === undefined || url === "" ? undefined : url;
};

export function itemOf(source: RegistrySource, server: OfficialServer): RegistryItem {
	const item: RegistryItem = {
		source,
		name: server.name,
		title: server.title ?? server.name,
		description: server.description ?? "",
		version: server.version ?? "",
		kinds: kindsOf(server),
	};
	const repositoryUrl = repositoryOf(server);
	if (repositoryUrl !== undefined) item.repositoryUrl = repositoryUrl;
	return item;
}

export function detailOf(server: OfficialServer, note?: string): RegistryDetail {
	const detail: RegistryDetail = {
		name: server.name,
		title: server.title ?? server.name,
		description: server.description ?? "",
		options: optionsOf(server),
	};
	const repositoryUrl = repositoryOf(server);
	if (repositoryUrl !== undefined) detail.repositoryUrl = repositoryUrl;
	if (note !== undefined) detail.note = note;
	return detail;
}

const KNOWN_TYPES = new Set(["npm", "pypi", "oci", "nuget", "cargo", "mcpb"]);

/** GitHub's packages often leave `registry_name` empty, so the type is read from what is there. */
export function githubPackageType(
	name: string,
	registry: string | undefined,
	hint: string | undefined,
) {
	const given = registry?.toLowerCase() ?? "";
	if (KNOWN_TYPES.has(given)) return given;
	if (given === "docker") return "oci";
	if (name.toLowerCase().endsWith(".mcpb")) return "mcpb";
	const runtime = hint?.toLowerCase();
	if (runtime === "docker") return "oci";
	if (runtime === "uvx" || runtime === "pipx") return "pypi";
	if (/^(ghcr\.io|docker\.io|quay\.io)\//.test(name)) return "oci";
	return "npm";
}

const githubValue = (value: GithubValue | GithubArgument) => ({
	description: value.description,
	isRequired: value.is_required,
	isSecret: value.is_secret,
	default: value.default,
	value: value.value,
	choices: value.choices,
	variables: Object.fromEntries(
		Object.entries(value.variables ?? {}).map(([name, variable]) => [
			name,
			{
				description: variable.description,
				isRequired: variable.is_required,
				isSecret: variable.is_secret,
				default: variable.default,
				choices: variable.choices,
			},
		]),
	),
});

const githubArguments = (list: readonly GithubArgument[] | null | undefined): OfficialArgument[] =>
	(list ?? []).map((argument) => ({
		...githubValue(argument),
		type: argument.type,
		name: argument.name,
		valueHint: argument.value_hint,
	}));

/** GitHub's server in the official shape, so one mapping serves both registries. */
export function fromGithub(server: GithubServer): OfficialServer {
	return {
		name: server.name,
		description: server.description,
		title: undefined,
		version: server.version_detail?.version,
		repository: server.repository,
		websiteUrl: undefined,
		packages: (server.packages ?? []).map((pkg) => ({
			registryType: githubPackageType(pkg.name, pkg.registry_name, pkg.runtime_hint),
			identifier: pkg.name,
			version: pkg.version,
			runtimeHint: pkg.runtime_hint,
			transport: { type: "stdio" },
			environmentVariables: (pkg.environment_variables ?? [])
				.map((variable) => ({
					...githubValue(variable),
					name: variable.name ?? "",
				}))
				.filter((variable) => variable.name !== ""),
			packageArguments: githubArguments(pkg.package_arguments),
			runtimeArguments: githubArguments(pkg.runtime_arguments),
		})),
		remotes: (server.remotes ?? []).map((remote) => ({
			type: remote.transport_type,
			url: remote.url,
			headers: (remote.headers ?? []).map((header) => ({
				...githubValue(header),
				// GitHub's headers carry no name; a token header is Authorization.
				name: header.name ?? "Authorization",
			})),
			variables: undefined,
		})),
	};
}
