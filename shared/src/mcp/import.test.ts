import { describe, expect, test } from "bun:test";

import {
	isPlaceholderValue,
	missingValueId,
	missingValuesOf,
	parseMcpPaste,
	withValues,
} from "./import";

const ok = (text: string) => {
	const parsed = parseMcpPaste(text);
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed;
};

describe("wrappers", () => {
	test("mcpServers (Claude, Cursor)", () => {
		const parsed = ok(
			JSON.stringify({
				mcpServers: {
					files: { command: "npx", args: ["-y", "files"], env: { TOKEN: "<YOUR_TOKEN>" } },
					docs: { url: "https://docs.test/mcp", headers: { Authorization: "Bearer x" } },
				},
			}),
		);
		expect(parsed.needsName).toBe(false);
		expect(parsed.entries.map((entry) => entry.name)).toEqual(["files", "docs"]);
		expect(parsed.entries[0]?.server).toEqual({
			transport: "stdio",
			command: "npx",
			args: ["-y", "files"],
			env: { TOKEN: "<YOUR_TOKEN>" },
		});
		expect(parsed.entries[1]?.server).toEqual({
			transport: "http",
			url: "https://docs.test/mcp",
			headers: { Authorization: "Bearer x" },
		});
	});

	test("servers (VS Code) and mcp.servers (VS Code settings)", () => {
		const body = { a: { type: "stdio", command: "node" } };
		expect(ok(JSON.stringify({ servers: body })).entries[0]?.name).toBe("a");
		expect(ok(JSON.stringify({ mcp: { servers: body } })).entries[0]?.name).toBe("a");
	});

	test("a bare map, and a README fragment without braces", () => {
		expect(ok('{ "a": { "command": "x" } }').entries[0]?.name).toBe("a");
		expect(ok('"a": { "command": "x" },').entries[0]?.name).toBe("a");
	});

	test("a single entry needs a name", () => {
		const parsed = ok('{ "command": "uvx", "args": ["mcp-thing"] }');
		expect(parsed.needsName).toBe(true);
		expect(parsed.entries[0]?.name).toBe("");
		expect(parsed.entries[0]?.server?.transport).toBe("stdio");
		expect(ok('{ "url": "https://x.test/mcp" }').needsName).toBe(true);
	});
});

describe("refusals", () => {
	test("legacy SSE gets pi's wording, by type and keeps the entry visible", () => {
		const entry = ok('{ "a": { "type": "sse", "url": "https://x.test/sse" } }').entries[0];
		expect(entry?.server).toBeUndefined();
		expect(entry?.problem).toBe(
			"pi does not support the legacy SSE transport; use the server's streamable HTTP URL.",
		);
	});

	test("an entry with no target, a bad name, a bad url, a bad exposure", () => {
		const entries = ok(
			JSON.stringify({
				a: { description: "nothing" },
				"bad name": { command: "x" },
				c: { url: "ftp://x" },
				d: { command: "x", exposure: "loud" },
			}),
		).entries;
		expect(entries.map((entry) => entry.server)).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		]);
		expect(entries[0]?.problem).toContain("neither a command nor a url");
		expect(entries[1]?.problem).toContain("letters, digits");
		expect(entries[2]?.problem).toContain("http or https");
		expect(entries[3]?.problem).toContain("exposure");
	});

	test("not JSON, not an object, nothing inside", () => {
		expect(parseMcpPaste("hello").ok).toBe(false);
		expect(parseMcpPaste("[]").ok).toBe(false);
		expect(parseMcpPaste("{}").ok).toBe(false);
		expect(parseMcpPaste("   ").ok).toBe(false);
		expect(parseMcpPaste('{ "a": 1, "b": 2 }').ok).toBe(false);
	});
});

describe("what is kept", () => {
	test("pi keys carry over, other keys are named as ignored", () => {
		const entry = ok(
			JSON.stringify({
				a: {
					command: "x",
					description: "A server",
					exposure: "codemode-deferred",
					toolExposure: { "get_*": "direct" },
					timeout: 30,
					disabled: true,
					alwaysAllow: ["read"],
				},
			}),
		).entries[0];
		expect(entry?.server).toMatchObject({
			description: "A server",
			exposure: "codemode",
			toolExposure: { "get_*": "direct" },
			timeout: 30,
		});
		expect(entry?.ignored).toEqual(["disabled", "alwaysAllow"]);
	});
});

describe("placeholders", () => {
	test.each([
		"",
		"  ",
		"<YOUR_API_KEY>",
		"${GITHUB_TOKEN}",
		"your-key-here",
		"YOUR_TOKEN",
		"changeme",
	])("%p waits for a value", (value) => expect(isPlaceholderValue(value)).toBe(true));
	test.each(["sk-abc123", "https://x.test", "true", "/home/me"])("%p is a value", (value) =>
		expect(isPlaceholderValue(value)).toBe(false),
	);
});

describe("values the person still owes", () => {
	const server = ok(
		JSON.stringify({
			a: {
				command: "x",
				env: { KEY: "<YOUR_KEY>", EMPTY: "", REF: "${HOME_TOKEN}", PLAIN: "1" },
			},
		}),
	).entries[0]?.server;

	test("empty and placeholder values are listed, plain ones are not", () => {
		if (server === undefined) throw new Error("no server");
		expect(missingValuesOf(server).map((value) => value.key)).toEqual(["KEY", "EMPTY", "REF"]);
	});

	test("typed values replace placeholders, blanks drop the variable, a reference stays", () => {
		if (server === undefined) throw new Error("no server");
		const filled = withValues(server, { [missingValueId({ kind: "env", key: "KEY" })]: "sk-1" });
		expect(filled).toMatchObject({ env: { KEY: "sk-1", REF: "${HOME_TOKEN}", PLAIN: "1" } });
		expect(filled.transport === "stdio" && "EMPTY" in filled.env).toBe(false);
	});
});
