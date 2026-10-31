import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import { detailOf, fromGithub, githubPackageType, itemOf, kindsOf, optionsOf } from "./domain";
import { githubServerSchema, officialServerSchema } from "./upstream";

type OfficialInput = z.input<typeof officialServerSchema>;
type PackageInput = NonNullable<OfficialInput["packages"]>[number];

const official = (raw: OfficialInput) => officialServerSchema.parse(raw);
const github = (raw: z.input<typeof githubServerSchema>) => githubServerSchema.parse(raw);

const first = (raw: OfficialInput) => {
	const option = optionsOf(official(raw))[0];
	if (option === undefined) throw new Error("no option");
	return option;
};

describe("npm packages", () => {
	const pkg = {
		registryType: "npm",
		identifier: "@scope/pkg",
		version: "1.2.0",
		transport: { type: "stdio" },
	};
	const server = { name: "io.example/files", packages: [pkg] };

	test("runs through npx -y with the pinned version", () => {
		const option = first(server);
		expect(option.supported).toBe(true);
		expect(option.label).toBe("npm · @scope/pkg 1.2.0");
		expect(option.entry).toEqual({
			transport: "stdio",
			command: "npx",
			args: ["-y", "@scope/pkg@1.2.0"],
			env: {},
		});
		expect(option.inputs).toEqual([]);
	});

	test("uses the runtime hint, and drops -y when it is not npx", () => {
		const option = first({
			...server,
			packages: [{ ...pkg, runtimeHint: "bunx" }],
		});
		expect(option.entry).toMatchObject({ command: "bunx", args: ["@scope/pkg@1.2.0"] });
	});

	test("puts runtime arguments before the package and package arguments after", () => {
		const option = first({
			...server,
			packages: [
				{
					...pkg,
					runtimeArguments: [{ type: "named", name: "--registry", value: "https://r.example" }],
					packageArguments: [
						{ type: "positional", value: "serve" },
						{ type: "named", name: "--port", value: "8080" },
					],
				},
			],
		});
		expect(option.entry).toMatchObject({
			args: [
				"-y",
				"--registry",
				"https://r.example",
				"@scope/pkg@1.2.0",
				"serve",
				"--port",
				"8080",
			],
		});
	});

	test("leaves the version off when the registry gives none", () => {
		const option = first({ ...server, packages: [{ ...pkg, version: undefined }] });
		expect(option.entry).toMatchObject({ args: ["-y", "@scope/pkg"] });
	});
});

describe("environment variables", () => {
	const withEnv = (environmentVariables: NonNullable<PackageInput["environmentVariables"]>) =>
		first({
			name: "a/b",
			packages: [{ registryType: "npm", identifier: "p", version: "1", environmentVariables }],
		});

	test("a required or secret variable becomes an input with a placeholder", () => {
		const option = withEnv([
			{ name: "API_KEY", description: "The key", isRequired: true, isSecret: true },
			{ name: "REGION", isRequired: true, default: "eu", choices: ["eu", "us"] },
		]);
		expect(option.entry).toMatchObject({
			env: { API_KEY: "{env:API_KEY}", REGION: "{env:REGION}" },
		});
		expect(option.inputs).toEqual([
			{
				key: "env:API_KEY",
				target: "env",
				name: "API_KEY",
				description: "The key",
				required: true,
				secret: true,
			},
			{
				key: "env:REGION",
				target: "env",
				name: "REGION",
				required: true,
				secret: false,
				default: "eu",
				choices: ["eu", "us"],
			},
		]);
	});

	test("an optional secret is an optional input", () => {
		const option = withEnv([{ name: "TOKEN", isSecret: true }]);
		expect(option.inputs).toMatchObject([{ key: "env:TOKEN", required: false, secret: true }]);
	});

	test("an optional plain variable keeps its default, or is left out", () => {
		const option = withEnv([{ name: "MODE", default: "fast" }, { name: "UNUSED" }]);
		expect(option.entry).toMatchObject({ env: { MODE: "fast" } });
		expect(option.inputs).toEqual([]);
	});

	test("a fixed value is kept and its {variables} become inputs", () => {
		const option = withEnv([
			{
				name: "URL",
				value: "https://{host}/api",
				variables: { host: { isRequired: true, default: "example.com" } },
			},
			{ name: "FIXED", value: "on" },
		]);
		expect(option.entry).toMatchObject({
			env: { URL: "https://{env:host}/api", FIXED: "on" },
		});
		expect(option.inputs).toMatchObject([
			{ key: "env:host", target: "env", name: "host", required: true, default: "example.com" },
		]);
	});
});

describe("pypi packages", () => {
	test("runs through uvx with == pinning", () => {
		const option = first({
			name: "a/b",
			packages: [
				{
					registryType: "pypi",
					identifier: "mcp-server-fetch",
					version: "0.6.2",
					packageArguments: [{ type: "named", name: "--user-agent", value: "x" }],
				},
			],
		});
		expect(option.label).toBe("pypi · mcp-server-fetch 0.6.2");
		expect(option.entry).toEqual({
			transport: "stdio",
			command: "uvx",
			args: ["mcp-server-fetch==0.6.2", "--user-agent", "x"],
			env: {},
		});
	});
});

describe("oci packages", () => {
	test("runs docker with -e per variable, runtime arguments, image and arguments", () => {
		const option = first({
			name: "a/b",
			packages: [
				{
					registryType: "oci",
					identifier: "ghcr.io/acme/server",
					version: "2.0.0",
					environmentVariables: [{ name: "KEY", isRequired: true, isSecret: true }],
					runtimeArguments: [{ type: "named", name: "--network", value: "host" }],
					packageArguments: [{ type: "positional", value: "stdio" }],
				},
			],
		});
		expect(option.entry).toEqual({
			transport: "stdio",
			command: "docker",
			args: [
				"run",
				"-i",
				"--rm",
				"-e",
				"KEY",
				"--network",
				"host",
				"ghcr.io/acme/server:2.0.0",
				"stdio",
			],
			env: { KEY: "{env:KEY}" },
		});
	});

	test("keeps a tag the identifier already carries", () => {
		const option = first({
			name: "a/b",
			packages: [{ registryType: "oci", identifier: "ghcr.io/acme/s:1.0", version: "1.0" }],
		});
		expect(option.entry).toMatchObject({ args: ["run", "-i", "--rm", "ghcr.io/acme/s:1.0"] });
	});

	test("a registry host with a port is not mistaken for a tag", () => {
		const option = first({
			name: "a/b",
			packages: [{ registryType: "oci", identifier: "localhost:5000/s", version: "1" }],
		});
		expect(option.entry).toMatchObject({ args: ["run", "-i", "--rm", "localhost:5000/s:1"] });
	});
});

describe("arguments", () => {
	const args = (packageArguments: NonNullable<PackageInput["packageArguments"]>) =>
		first({
			name: "a/b",
			packages: [{ registryType: "pypi", identifier: "p", version: "1", packageArguments }],
		});

	test("a required positional without a value is asked for", () => {
		const option = args([
			{ type: "positional", valueHint: "path", isRequired: true, description: "Root" },
		]);
		expect(option.entry).toMatchObject({ args: ["p==1", "{arg:path}"] });
		expect(option.inputs).toMatchObject([
			{ key: "arg:path", target: "arg", name: "path", required: true, description: "Root" },
		]);
	});

	test("a required named argument keeps its flag before the placeholder", () => {
		const option = args([{ type: "named", name: "--root", isRequired: true }]);
		expect(option.entry).toMatchObject({ args: ["p==1", "--root", "{arg:--root}"] });
	});

	test("optional arguments without a value or default are left out", () => {
		const option = args([
			{ type: "positional", valueHint: "extra" },
			{ type: "named", name: "--flag" },
			{ type: "named", name: "--level", default: "info" },
		]);
		expect(option.entry).toMatchObject({ args: ["p==1", "--level", "info"] });
		expect(option.inputs).toEqual([]);
	});

	test("{variables} inside an argument become inputs of that argument", () => {
		const option = args([
			{
				type: "named",
				name: "--dir",
				value: "{base}/data",
				variables: { base: { isRequired: true } },
			},
		]);
		expect(option.entry).toMatchObject({ args: ["p==1", "--dir", "{arg:base}/data"] });
		expect(option.inputs).toMatchObject([{ key: "arg:base", name: "base", required: true }]);
	});

	test("one input is asked once even when two places use it", () => {
		const option = args([
			{ type: "named", name: "--a", value: "{x}", variables: { x: { isRequired: true } } },
			{ type: "named", name: "--b", value: "{x}", variables: { x: { isRequired: true } } },
		]);
		expect(option.inputs).toHaveLength(1);
	});
});

describe("remotes", () => {
	test("a streamable-http remote becomes an http entry", () => {
		const option = first({
			name: "a/b",
			remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }],
		});
		expect(option.label).toBe("Remote · https://mcp.example.com/mcp");
		expect(option.entry).toEqual({
			transport: "http",
			url: "https://mcp.example.com/mcp",
			headers: {},
		});
	});

	test("URL variables and headers", () => {
		const option = first({
			name: "a/b",
			remotes: [
				{
					type: "streamable-http",
					url: "https://{tenant}.example.com/mcp",
					variables: { tenant: { isRequired: true, description: "Tenant" } },
					headers: [
						{
							name: "Authorization",
							value: "Bearer {token}",
							variables: { token: { isSecret: true, isRequired: true } },
						},
						{ name: "X-Key", isRequired: true, isSecret: true },
						{ name: "X-Fixed", value: "yes" },
						{ name: "X-Default", default: "d" },
						{ name: "X-Skipped" },
					],
				},
			],
		});
		expect(option.entry).toEqual({
			transport: "http",
			url: "https://{url:tenant}.example.com/mcp",
			headers: {
				Authorization: "Bearer {header:token}",
				"X-Key": "{header:X-Key}",
				"X-Fixed": "yes",
				"X-Default": "d",
			},
		});
		expect(option.inputs.map((input) => input.key)).toEqual([
			"url:tenant",
			"header:token",
			"header:X-Key",
		]);
		expect(option.inputs[1]).toMatchObject({ secret: true, required: true, target: "header" });
	});

	test("a {variable} the registry did not describe is a required secret in a header", () => {
		const option = first({
			name: "a/b",
			remotes: [
				{
					type: "streamable-http",
					url: "https://x.test",
					headers: [{ name: "Authorization", value: "Bearer {TOKEN}" }],
				},
			],
		});
		expect(option.inputs).toMatchObject([
			{ key: "header:TOKEN", name: "TOKEN", required: true, secret: true },
		]);
	});

	test("sse is not supported", () => {
		const option = first({ name: "a/b", remotes: [{ type: "sse", url: "https://x.test/sse" }] });
		expect(option).toMatchObject({
			supported: false,
			reason: "pi doesn't speak legacy SSE",
			inputs: [],
		});
		expect(option.entry).toBeUndefined();
	});
});

describe("unsupported packages", () => {
	test.each([
		["nuget", "NuGet packages are not supported"],
		["cargo", "Cargo packages are not supported"],
		["mcpb", "MCPB bundles are not supported"],
		["homebrew", "homebrew packages are not supported"],
	])("%s", (registryType, reason) => {
		const option = first({
			name: "a/b",
			packages: [{ registryType, identifier: "x", version: "1" }],
		});
		expect(option).toMatchObject({ supported: false, reason });
		expect(option.entry).toBeUndefined();
	});

	test("a package that is an HTTP server to start yourself", () => {
		const option = first({
			name: "a/b",
			packages: [
				{
					registryType: "npm",
					identifier: "x",
					version: "1",
					transport: { type: "streamable-http" },
				},
			],
		});
		expect(option.supported).toBe(false);
		expect(option.reason).toContain("streamable-http");
	});
});

describe("summaries", () => {
	const server = official({
		name: "io.example/files",
		description: "Files",
		version: "1.0.0",
		repository: { url: "https://github.com/example/files", source: "github" },
		packages: [
			{ registryType: "npm", identifier: "a", version: "1" },
			{ registryType: "NPM", identifier: "b", version: "1" },
			{ registryType: "pypi", identifier: "c", version: "1" },
		],
		remotes: [{ type: "streamable-http", url: "https://x.test" }],
	});

	test("kinds are unique, lower case, and end with remote", () => {
		expect(kindsOf(server)).toEqual(["npm", "pypi", "remote"]);
	});

	test("an item takes the title or the name", () => {
		expect(itemOf("official", server)).toEqual({
			source: "official",
			name: "io.example/files",
			title: "io.example/files",
			description: "Files",
			version: "1.0.0",
			repositoryUrl: "https://github.com/example/files",
			kinds: ["npm", "pypi", "remote"],
		});
		expect(itemOf("official", { ...server, title: "Files" }).title).toBe("Files");
	});

	test("a server with no repository falls back to its website, then to none", () => {
		const bare = official({ name: "a/b", websiteUrl: "https://site.test" });
		expect(itemOf("official", bare).repositoryUrl).toBe("https://site.test");
		expect(itemOf("official", official({ name: "a/b" })).repositoryUrl).toBeUndefined();
	});

	test("detail carries the note it is given", () => {
		expect(detailOf(server, "note").note).toBe("note");
		expect(detailOf(server).note).toBeUndefined();
	});
});

describe("github servers", () => {
	test("package types are read from what is there when registry_name is empty", () => {
		expect(githubPackageType("markitdown-mcp", "", "uvx")).toBe("pypi");
		expect(githubPackageType("@playwright/mcp", "", "npx")).toBe("npm");
		expect(githubPackageType("ghcr.io/github/x:1", "", undefined)).toBe("oci");
		expect(githubPackageType("https://x/y.mcpb", "", undefined)).toBe("mcpb");
		expect(githubPackageType("x", "pypi", undefined)).toBe("pypi");
		expect(githubPackageType("x", "docker", undefined)).toBe("oci");
		expect(githubPackageType("x", "", undefined)).toBe("npm");
	});

	test("snake_case packages and remotes map into install options", () => {
		const server = fromGithub(
			github({
				name: "io.github.acme/thing",
				description: "Thing",
				version_detail: { version: "3.1.0" },
				repository: { url: "https://github.com/acme/thing" },
				packages: [
					{
						name: "thing-mcp",
						registry_name: "",
						runtime_hint: "uvx",
						version: "0.2",
						environment_variables: [{ name: "KEY", is_secret: true, description: "Key" }],
					},
					{
						name: "ghcr.io/acme/thing:3.1.0",
						registry_name: "",
						version: "",
						runtime_arguments: [
							{ type: "named", name: "-p", value: "127.0.0.1:8085:8085" },
							{
								type: "named",
								name: "-e",
								value: "TOKEN={token}",
								variables: { token: { is_secret: true } },
							},
						],
					},
				],
				remotes: [
					{
						transport_type: "streamable-http",
						url: "https://thing.test/mcp",
						headers: [{ is_secret: true, value: "Bearer {THING_TOKEN}" }, { is_secret: true }],
					},
				],
			}),
		);
		expect(server.version).toBe("3.1.0");
		const [pypi, oci, remote] = optionsOf(server);
		expect(pypi?.entry).toMatchObject({
			command: "uvx",
			args: ["thing-mcp==0.2"],
			env: { KEY: "{env:KEY}" },
		});
		expect(pypi?.inputs).toMatchObject([{ key: "env:KEY", secret: true, description: "Key" }]);
		expect(oci?.entry).toMatchObject({
			command: "docker",
			args: [
				"run",
				"-i",
				"--rm",
				"-p",
				"127.0.0.1:8085:8085",
				"-e",
				"TOKEN={arg:token}",
				"ghcr.io/acme/thing:3.1.0",
			],
		});
		expect(oci?.inputs).toMatchObject([{ key: "arg:token", secret: true }]);
		expect(remote?.entry).toMatchObject({
			url: "https://thing.test/mcp",
			headers: { Authorization: "{header:Authorization}" },
		});
		expect(remote?.inputs.map((input) => input.key)).toEqual([
			"header:THING_TOKEN",
			"header:Authorization",
		]);
	});
});
