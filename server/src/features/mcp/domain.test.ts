/**
 * The MCP resolver: every kind an entry can resolve to, every relation between
 * the two files, and every reason pi skips an entry.
 */
import { describe, expect, test } from "bun:test";

import { entriesOf, readTarget } from "./domain";
import type { McpRawEntry, McpRawObject, McpServer } from "./domain";

type Raw = McpRawObject;

const resolve = (global: Raw, project: Raw): McpServer[] => entriesOf(global, project);

const problemOf = (entry: McpServer | undefined): string =>
	entry?.kind === "invalid" ? entry.problem : "not invalid";

const relationOf = (entry: McpServer | undefined) =>
	entry?.kind === "server" ? entry.relation : "not a server";

const find = (entries: McpServer[], scope: "global" | "project", name: string) =>
	entries.find((entry) => entry.scope === scope && entry.name === name);

const stdio = { command: "npx", args: ["files"] };
const http = { url: "https://example.test/mcp" };

describe("one file", () => {
	const valid: [string, Raw, "stdio" | "http"][] = [
		["stdio by command", stdio, "stdio"],
		["stdio by type", { type: "stdio", command: "npx" }, "stdio"],
		["http by url", http, "http"],
		["http by type", { type: "streamable-http", url: "https://example.test" }, "http"],
	];
	test.each(valid)("a global %s is a server", (_label, entry, transport) => {
		const [server] = resolve({ files: entry }, {});
		expect(server).toMatchObject({ kind: "server", scope: "global", transport });
		expect(relationOf(server)).toBeUndefined();
	});

	const invalidGlobals: [string, string, McpRawEntry, string, boolean][] = [
		["a name with a space", "bad name", stdio, "A server name may only use", true],
		["legacy sse", "files", { type: "sse", url: "https://example.test" }, "legacy SSE", true],
		["a non-http url", "files", { url: "ftp://example.test" }, "http or https URL", true],
		[
			"no target",
			"files",
			{ description: "x", timeout: 5 },
			'needs either "command" or "url"',
			true,
		],
		[
			"an override-only entry",
			"files",
			{ enabled: false },
			'needs either "command" or "url"',
			false,
		],
		["a type without a target", "files", { type: "stdio" }, 'needs either "command"', true],
		["a bad exposure", "files", { command: "x", exposure: "loud" }, "exposure must be", true],
		["a bad timeout", "files", { command: "x", timeout: -1 }, "timeout", true],
		["not an object", "files", "npx", "not an object", true],
	];
	test.each(invalidGlobals)("a global with %s is invalid", (_l, name, entry, problem, enabled) => {
		const [server] = resolve({ [name]: entry }, {});
		expect(server).toMatchObject({ kind: "invalid", scope: "global", enabled });
		expect(server?.kind === "invalid" && server.problem).toContain(problem);
		// A global entry is never meant as an override.
		expect(server?.kind === "invalid" && server.overrideKeys).toBeUndefined();
	});

	test("an invalid entry keeps its own enabled flag", () => {
		const [server] = resolve({ files: { type: "sse", url: "https://x", enabled: false } }, {});
		expect(server).toMatchObject({ kind: "invalid", enabled: false });
	});
});

describe("namespaces", () => {
	test("global names that differ only in - and _ clash, the later one is invalid", () => {
		const entries = resolve({ "a-b": stdio, a_b: stdio }, {});
		expect(find(entries, "global", "a-b")?.kind).toBe("server");
		expect(find(entries, "global", "a_b")).toMatchObject({
			kind: "invalid",
			problem: 'shares its tool namespace with "a-b", so pi skips it.',
		});
	});

	test("a project server clashing with a global of another name is invalid", () => {
		const entries = resolve({ "a-b": stdio }, { a_b: stdio });
		expect(find(entries, "project", "a_b")).toMatchObject({
			kind: "invalid",
			problem: 'shares its tool namespace with "a-b", so pi skips it.',
		});
		expect(find(entries, "global", "a-b")).toMatchObject({ kind: "server" });
		expect(relationOf(find(entries, "global", "a-b"))).toBeUndefined();
	});

	test("a project server of the same name as a global is not a clash", () => {
		const entries = resolve({ "a-b": stdio }, { "a-b": http });
		expect(find(entries, "project", "a-b")?.kind).toBe("server");
	});
});

describe("relations", () => {
	test("a project server replaces the global one of its name", () => {
		const entries = resolve({ files: stdio }, { files: http });
		expect(find(entries, "global", "files")).toMatchObject({
			kind: "server",
			relation: "replaced-by-project",
		});
		expect(find(entries, "project", "files")).toMatchObject({
			kind: "server",
			transport: "http",
			relation: "replaces-global",
		});
	});

	test("a project override changes the global one and resolves its config", () => {
		const entries = resolve(
			{ files: { ...stdio, enabled: true, exposure: "direct" } },
			{ files: { enabled: false, toolExposure: { read: "hidden" } } },
		);
		expect(find(entries, "global", "files")).toMatchObject({
			kind: "server",
			relation: "overridden-by-project",
		});
		const override = find(entries, "project", "files");
		expect(override).toMatchObject({
			kind: "override",
			scope: "project",
			transport: "stdio",
			keys: ["enabled", "toolExposure"],
			enabled: false,
		});
		// The base's keys stay, the override's win.
		expect(override?.kind === "override" && override.config).toMatchObject({
			command: "npx",
			exposure: "direct",
			enabled: false,
			toolExposure: { read: "hidden" },
		});
	});

	test("an override that sets no enabled carries none", () => {
		const entries = resolve({ files: stdio }, { files: { exposure: "hidden" } });
		const override = find(entries, "project", "files");
		expect(override).toMatchObject({ kind: "override", keys: ["exposure"] });
		expect(override?.kind === "override" && override.enabled).toBeUndefined();
	});

	test("resolving does not change the entries it was given", () => {
		const global = { files: stdio };
		const project = { files: { enabled: false } };
		const before = JSON.stringify([global, project]);
		entriesOf(global, project);
		expect(JSON.stringify([global, project])).toBe(before);
	});

	test("two resolutions of the same input are equal", () => {
		const global = { files: stdio };
		const project = { files: http };
		expect(entriesOf(global, project)).toEqual(entriesOf(global, project));
	});

	test("an unrelated project server has no relation", () => {
		const entries = resolve({ files: stdio }, { docs: http });
		expect(relationOf(find(entries, "project", "docs"))).toBeUndefined();
		expect(relationOf(find(entries, "global", "files"))).toBeUndefined();
	});

	test("an invalid global is neither replaced nor overridden", () => {
		const entries = resolve(
			{ files: { type: "sse", url: "https://x" } },
			{ files: { enabled: true } },
		);
		expect(find(entries, "global", "files")?.kind).toBe("invalid");
		expect(find(entries, "project", "files")).toMatchObject({ kind: "invalid" });
	});
});

describe("invalid project entries", () => {
	test("an empty project entry is a valid override that changes nothing", () => {
		const entries = resolve({ files: stdio }, { files: {} });
		expect(find(entries, "project", "files")).toMatchObject({ kind: "override", keys: [] });
	});

	const cases: [string, Raw, Raw, string, string[] | undefined][] = [
		[
			"an override of a missing global",
			{},
			{ files: { enabled: false } },
			"needs a global server of this name",
			["enabled"],
		],
		[
			"an override of a global that is itself invalid",
			{ files: { type: "sse", url: "https://x" } },
			{ files: { exposure: "hidden" } },
			"needs a global server of this name",
			["exposure"],
		],
		[
			"an override with a foreign key",
			{ files: stdio },
			{ files: { enabled: false, description: "x" } },
			"an override can only set enabled, exposure, toolExposure; it also sets description",
			["enabled"],
		],
		[
			"auth on a project http server",
			{},
			{ docs: { ...http, auth: { provider: "x" } } },
			"auth is only allowed in the global mcp.json",
			undefined,
		],
		["a bad project name", {}, { "no way": stdio }, "A server name may only use", undefined],
		["a project entry that is not an object", {}, { docs: 3 }, "not an object", undefined],
		[
			"a malformed override (bad exposure)",
			{ files: stdio },
			{ files: { exposure: "loud" } },
			"exposure must be",
			["exposure"],
		],
	];
	test.each(cases)("%s", (_label, global, project, problem, overrideKeys) => {
		const entries = resolve(global, project);
		const entry = entries.find((candidate) => candidate.scope === "project");
		expect(entry).toMatchObject({ kind: "invalid", scope: "project" });
		expect(problemOf(entry)).toContain(problem);
		expect<unknown>(entry?.kind === "invalid" ? entry.overrideKeys : "not invalid").toEqual(
			overrideKeys,
		);
	});

	test("an invalid override keeps its enabled flag", () => {
		const entries = resolve({}, { files: { enabled: false } });
		expect(find(entries, "project", "files")).toMatchObject({ kind: "invalid", enabled: false });
	});
});

describe("pi's validator rules", () => {
	const invalidCases: [string, Raw, string][] = [
		[
			"a callback URL with a query",
			{ url: "https://x.test/mcp", oauth: { callbackUrl: "http://127.0.0.1:8080/callback?x=1" } },
			"query or a fragment",
		],
		[
			"a callback port out of range",
			{ url: "https://x.test/mcp", oauth: { callbackPort: 70_000 } },
			"port number",
		],
		[
			"a callback URL and port that disagree",
			{
				url: "https://x.test/mcp",
				oauth: { callbackUrl: "http://127.0.0.1:8080/callback", callbackPort: 9090 },
			},
			"different ports",
		],
		[
			"cimd with a client id",
			{ url: "https://x.test/mcp", oauth: { clientRegistration: "cimd", clientId: "a" } },
			'"cimd" cannot be combined',
		],
		[
			"a metadata URL on plain http",
			{
				url: "https://x.test/mcp",
				oauth: { authServerMetadataUrl: "http://example.test/metadata" },
			},
			"https URL",
		],
		[
			"auth over plain http off this machine",
			{ url: "http://example.test/mcp", auth: { provider: "openai" } },
			"auth requires an https URL",
		],
	];
	test.each(invalidCases)("%s is invalid", (_label, entry, problem) => {
		const [server] = resolve({ docs: entry }, {});
		expect(server).toMatchObject({ kind: "invalid" });
		expect(problemOf(server)).toContain(problem);
	});

	const validCases: [string, Raw][] = [
		[
			"a loopback callback",
			{
				url: "https://x.test/mcp",
				oauth: { callbackUrl: "http://localhost:8080/callback", callbackPort: 8080 },
			},
		],
		["cimd alone", { url: "https://x.test/mcp", oauth: { clientRegistration: "cimd" } }],
		["auth on loopback http", { url: "http://127.0.0.1:3000/mcp", auth: { provider: "openai" } }],
		[
			"metadata on loopback http",
			{
				url: "https://x.test/mcp",
				oauth: { authServerMetadataUrl: "http://localhost:9000/metadata" },
			},
		],
	];
	test.each(validCases)("%s is a server", (_label, entry) => {
		expect(resolve({ docs: entry }, {})[0]?.kind).toBe("server");
	});
});

describe("the raw target of an entry pi skips", () => {
	test("keeps what has the right type and leaves out what does not", () => {
		const target = readTarget({
			command: "npx",
			args: ["a", 2],
			cwd: 7,
			env: { TOKEN: "secret", BAD: 1 },
			exposure: "loud",
			description: "d",
		});
		expect(target).toEqual({
			transport: "stdio",
			command: "npx",
			description: "d",
			envKeys: ["TOKEN"],
			headerKeys: [],
		});
	});

	test("a url picks the http transport, and neither leaves it undefined", () => {
		expect(readTarget({ url: "https://x.test/mcp" })).toMatchObject({ transport: "http" });
		expect(readTarget({ command: 3 }).transport).toBeUndefined();
	});
});
