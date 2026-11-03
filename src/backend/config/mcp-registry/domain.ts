import type {
	McpRegistryDetail,
	McpRegistryEntry,
	McpRegistryInput,
	McpRegistryItem,
	McpRegistryOption,
	McpRegistrySource,
} from "#protocol/config/mcp-registry";

import { withDefined } from "../../../domain/object.ts";
import type {
	GithubArgument,
	GithubServer,
	GithubValue,
	OfficialArgument,
	OfficialPackage,
	OfficialRemote,
	OfficialServer,
	OfficialVariableFields,
} from "./upstream.ts";

/**
 * Registry data into install options, with no I/O.
 *
 * A registry describes how a server runs (a package and its arguments, or a remote URL);
 * the options here are the `mcp.json` entries those descriptions mean, with a `{key}`
 * placeholder wherever the operator has to supply a value. The spec has no `command`, so
 * it is derived from the package type.
 */

/** What every env variable, header and argument of the spec has in common. */
type ValueLike = {
	readonly description?: string | null | undefined;
	readonly isRequired?: boolean | null | undefined;
	readonly isSecret?: boolean | null | undefined;
	readonly default?: string | null | undefined;
	readonly value?: string | null | undefined;
	readonly choices?: ReadonlyArray<string> | null | undefined;
	readonly variables?: Readonly<Record<string, OfficialVariableFields>> | null | undefined;
};

type Target = McpRegistryInput["target"];

const NO_SSE = "pi does not speak legacy SSE";
const PLACEHOLDER = /\{([A-Za-z0-9_.-]+)\}/g;

/** Collects the inputs while an entry is built; the same key is asked for once. */
class Inputs {
	readonly list: McpRegistryInput[] = [];

	add(input: McpRegistryInput): void {
		if (!this.list.some((existing) => existing.key === input.key)) this.list.push(input);
	}
}

const inputKey = (target: Target, name: string): string => `${target}:${name}`;

const inputOf = (target: Target, name: string, item: ValueLike): McpRegistryInput => {
	const input: McpRegistryInput = {
		key: inputKey(target, name),
		target,
		name,
		required: item.isRequired === true,
		secret: item.isSecret === true,
	};
	const described = withDefined(
		input,
		"description",
		item.description === null || item.description === "" ? undefined : item.description,
	);
	const withDefault = withDefined(
		described,
		"default",
		item.default === null || item.default === "" ? undefined : item.default,
	);
	return withDefined(
		withDefault,
		"choices",
		item.choices === null || item.choices?.length === 0 ? undefined : item.choices,
	);
};

/**
 * A template with its `{variable}` names turned into placeholders of this target. A
 * variable the registry did not describe is required, and secret in a header or an
 * environment variable, where a token is what it most likely stands for.
 */
function fill(
	template: string,
	variables: Readonly<Record<string, OfficialVariableFields>> | null | undefined,
	target: Target,
	inputs: Inputs,
): string {
	return template.replaceAll(PLACEHOLDER, (_match, name: string) => {
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
 * The value an item has in the entry: its own, its placeholder when the operator has to
 * supply it (required or secret), its default, or nothing at all.
 */
function resolve(
	item: ValueLike,
	target: Target,
	name: string,
	inputs: Inputs,
): string | undefined {
	if (item.value !== null && item.value !== undefined && item.value !== "") {
		return fill(item.value, item.variables, target, inputs);
	}
	if (item.isRequired === true || item.isSecret === true) {
		inputs.add(inputOf(target, name, item));
		return `{${inputKey(target, name)}}`;
	}
	return item.default === null || item.default === undefined || item.default === ""
		? undefined
		: item.default;
}

/** `--name value` for a named argument, the value for a positional one. */
function argumentsOf(
	list: ReadonlyArray<OfficialArgument> | null | undefined,
	inputs: Inputs,
): ReadonlyArray<string> {
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

const environmentOf = (
	list: ReadonlyArray<{ readonly name: string } & ValueLike> | null | undefined,
	inputs: Inputs,
): Readonly<Record<string, string>> =>
	Object.fromEntries(
		(list ?? []).flatMap((variable): [string, string][] => {
			const value = resolve(variable, "env", variable.name, inputs);
			return value === undefined ? [] : [[variable.name, value]];
		}),
	);

const unsupported = (id: string, label: string, reason: string): McpRegistryOption => ({
	id,
	label,
	supported: false,
	reason,
	inputs: [],
});

const supportedPackageTypes = new Set(["npm", "pypi", "oci"]);

const packageReasons = new Map([
	["nuget", "NuGet packages are not supported"],
	["cargo", "Cargo packages are not supported"],
	["mcpb", "MCPB bundles are not supported"],
]);

const packageLabel = (pkg: OfficialPackage): string => {
	const version = pkg.version ?? "";
	return `${pkg.registryType} · ${pkg.identifier}${version === "" ? "" : ` ${version}`}`;
};

/** An image reference already names its tag or digest when it has one after the last slash. */
const imageOf = (identifier: string, version: string | null | undefined): string => {
	const last = identifier.slice(identifier.lastIndexOf("/") + 1);
	if (version === null || version === undefined || version === "" || /[:@]/.test(last)) {
		return identifier;
	}
	return `${identifier}:${version}`;
};

function packageOption(pkg: OfficialPackage, index: number): McpRegistryOption {
	const id = `package:${index}`;
	const label = packageLabel(pkg);
	const type = pkg.registryType.toLowerCase();
	const reason = packageReasons.get(type);
	if (reason !== undefined) return unsupported(id, label, reason);
	if (!supportedPackageTypes.has(type)) {
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
	let args: ReadonlyArray<string>;
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
	const entry: McpRegistryEntry = {
		transport: "stdio",
		command,
		args: [...args],
		env: { ...env },
	};
	return { id, label, supported: true, entry, inputs: inputs.list };
}

function remoteOption(remote: OfficialRemote, index: number): McpRegistryOption {
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
	const entry: McpRegistryEntry = { transport: "http", url, headers };
	return { id, label, supported: true, entry, inputs: inputs.list };
}

/** Packages first, then remotes, in the order the registry lists them. */
export function optionsOf(server: OfficialServer): ReadonlyArray<McpRegistryOption> {
	return [
		...(server.packages ?? []).map((pkg, index) => packageOption(pkg, index)),
		...(server.remotes ?? []).map((remote, index) => remoteOption(remote, index)),
	];
}

/** The package types a server ships as, and `remote` when it also has a URL. */
export function kindsOf(server: OfficialServer): ReadonlyArray<string> {
	const kinds = (server.packages ?? []).map((pkg) => pkg.registryType.toLowerCase());
	if ((server.remotes ?? []).length > 0) kinds.push("remote");
	return [...new Set(kinds)];
}

const repositoryOf = (server: OfficialServer): string | undefined => {
	const url = server.repository?.url ?? server.websiteUrl;
	return url === null || url === undefined || url === "" ? undefined : url;
};

export function itemOf(source: McpRegistrySource, server: OfficialServer): McpRegistryItem {
	const item: McpRegistryItem = {
		source,
		name: server.name,
		title: server.title ?? server.name,
		description: server.description ?? "",
		version: server.version ?? "",
		kinds: [...kindsOf(server)],
	};
	return withDefined(item, "repositoryUrl", repositoryOf(server));
}

export function detailOf(server: OfficialServer, note?: string): McpRegistryDetail {
	const detail: McpRegistryDetail = {
		name: server.name,
		title: server.title ?? server.name,
		description: server.description ?? "",
		options: [...optionsOf(server)],
	};
	return withDefined(withDefined(detail, "repositoryUrl", repositoryOf(server)), "note", note);
}

const knownTypes = new Set(["npm", "pypi", "oci", "nuget", "cargo", "mcpb"]);

/** GitHub's packages often leave `registry_name` empty, so the type is read from what is there. */
export function githubPackageType(
	name: string,
	registry: string | null | undefined,
	hint: string | null | undefined,
): string {
	const given = registry?.toLowerCase() ?? "";
	if (knownTypes.has(given)) return given;
	if (given === "docker") return "oci";
	if (name.toLowerCase().endsWith(".mcpb")) return "mcpb";
	const runtime = hint?.toLowerCase();
	if (runtime === "docker") return "oci";
	if (runtime === "uvx" || runtime === "pipx") return "pypi";
	if (/^(ghcr\.io|docker\.io|quay\.io)\//.test(name)) return "oci";
	return "npm";
}

const githubValue = (
	value: GithubValue | GithubArgument,
): Omit<OfficialArgument, "name" | "valueHint" | "type"> => ({
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

const githubArguments = (
	list: ReadonlyArray<GithubArgument> | null | undefined,
): ReadonlyArray<OfficialArgument> =>
	(list ?? []).map((argument) =>
		Object.assign({}, githubValue(argument), {
			type: argument.type,
			name: argument.name,
			valueHint: argument.value_hint,
		}),
	);

/** GitHub's server in the official shape, so one mapping serves both registries. */
export function fromGithub(server: GithubServer): OfficialServer {
	return {
		name: server.name,
		description: server.description,
		version: server.version_detail?.version,
		repository: server.repository,
		packages: (server.packages ?? []).map((pkg) => ({
			registryType: githubPackageType(pkg.name, pkg.registry_name, pkg.runtime_hint),
			identifier: pkg.name,
			version: pkg.version,
			runtimeHint: pkg.runtime_hint,
			transport: { type: "stdio" },
			environmentVariables: (pkg.environment_variables ?? [])
				.map((variable) => Object.assign({}, githubValue(variable), { name: variable.name ?? "" }))
				.filter((variable) => variable.name !== ""),
			packageArguments: [...githubArguments(pkg.package_arguments)],
			runtimeArguments: [...githubArguments(pkg.runtime_arguments)],
		})),
		remotes: (server.remotes ?? []).map((remote) => ({
			type: remote.transport_type,
			url: remote.url,
			// GitHub's headers carry no name; a token header is Authorization.
			headers: (remote.headers ?? []).map((header) =>
				Object.assign({}, githubValue(header), { name: header.name ?? "Authorization" }),
			),
		})),
	};
}
