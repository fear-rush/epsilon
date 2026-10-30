/**
 * `mcp.json` is hand-editable and holds secrets, so a write keeps what this
 * version does not model, keeps a stored value the browser never saw, and never
 * replaces a file it cannot parse. These checks read the file back.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import {
	listMcpServers,
	readMcpServer,
	setMcpAutoEnableCodemode,
	setMcpServerEnabled,
	writeMcpServer,
} from "./service";

const scratch = async () => {
	const home = agentHome(await mkdtemp(join(tmpdir(), "epsilon-mcp-")));
	const projectDir = await mkdtemp(join(tmpdir(), "epsilon-mcp-project-"));
	return { home, projectDir };
};

const stored = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("mcp writes", () => {
	test("writes a stdio server, drops blank optional fields and keeps unknown keys", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				futureTopLevel: 1,
				mcpServers: { files: { command: "old", futureKey: "keep", env: { TOKEN: "secret" } } },
			}),
		);

		await writeMcpServer(home, projectDir, {
			scope: "global",
			name: "files",
			transport: "stdio",
			command: "npx",
			args: [],
			cwd: "",
			description: "",
			exposure: "codemode",
			env: { TOKEN: "" },
		});

		const file = await stored(home.mcpFile);
		expect(file.futureTopLevel).toBe(1);
		expect(file.mcpServers.files).toEqual({
			command: "npx",
			futureKey: "keep",
			env: { TOKEN: "secret" },
		});
		expect((await stat(home.mcpFile)).mode & 0o777).toBe(0o600);
	});

	test("a blank env value with nothing stored is refused", async () => {
		const { home, projectDir } = await scratch();
		await expect(
			writeMcpServer(home, projectDir, {
				scope: "global",
				name: "files",
				transport: "stdio",
				command: "npx",
				env: { TOKEN: "" },
			}),
		).rejects.toThrow('Add a value for "TOKEN", or remove the row.');
	});

	test("the switch writes enabled:false and removes the key to turn on", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(home.mcpFile, JSON.stringify({ mcpServers: { files: { command: "npx" } } }));

		await setMcpServerEnabled(home, projectDir, "global", "files", false);
		expect((await stored(home.mcpFile)).mcpServers.files.enabled).toBe(false);

		await setMcpServerEnabled(home, projectDir, "global", "files", true);
		expect((await stored(home.mcpFile)).mcpServers.files).toEqual({ command: "npx" });
	});

	test("a project file is created 0644 and a broken one is never replaced", async () => {
		const { home, projectDir } = await scratch();
		await writeMcpServer(home, projectDir, {
			scope: "project",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
		});
		const path = join(projectDir, ".pi", "mcp.json");
		expect((await stat(path)).mode & 0o777).toBe(0o644);

		await writeFile(home.mcpFile, "{ nope");
		await expect(
			writeMcpServer(home, projectDir, {
				scope: "global",
				name: "files",
				transport: "stdio",
				command: "npx",
			}),
		).rejects.toThrow("mcp.json cannot be written");
		expect(await readFile(home.mcpFile, "utf8")).toBe("{ nope");
	});
});

describe("mcp reads", () => {
	const seed = async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				mcpServers: {
					files: { command: "npx", args: ["a"], env: { TOKEN: "secret" }, exposure: "direct" },
					docs: { url: "https://example.test/mcp", headers: { Authorization: "x" } },
					broken: { type: "sse", url: "https://example.test", enabled: false },
				},
			}),
		);
		await mkdir(join(projectDir, ".pi"));
		await writeFile(
			join(projectDir, ".pi", "mcp.json"),
			JSON.stringify({ mcpServers: { files: { enabled: false }, extra: { command: "x" } } }),
		);
		return { home, projectDir };
	};

	test("the list carries each kind and relation, with no value of a secret", async () => {
		const { home, projectDir } = await seed();
		const { servers } = await listMcpServers(home, projectDir);
		const byKey = Object.fromEntries(
			servers.map((server) => [`${server.scope}/${server.name}`, server]),
		);
		expect(byKey["global/files"]).toMatchObject({
			kind: "server",
			relation: "overridden-by-project",
			target: "npx a",
			enabled: true,
		});
		expect(byKey["project/files"]).toMatchObject({
			kind: "override",
			overrideKeys: ["enabled"],
			overrideEnabled: false,
			enabled: false,
			target: "npx a",
		});
		expect(byKey["global/broken"]).toMatchObject({
			kind: "invalid",
			enabled: false,
		});
		expect(byKey["global/docs"]).toMatchObject({ kind: "server", transport: "http" });
		expect(byKey["project/extra"]).toMatchObject({ kind: "server", scope: "project" });
		expect(JSON.stringify(servers)).not.toContain("secret");
	});

	test("the detail of a server names its stored keys, an override and an invalid entry are their row", async () => {
		const { home, projectDir } = await seed();
		expect(await readMcpServer(home, projectDir, "global", "files")).toMatchObject({
			kind: "server",
			command: "npx",
			envKeys: ["TOKEN"],
			exposure: "direct",
		});
		expect(await readMcpServer(home, projectDir, "global", "docs")).toMatchObject({
			headerKeys: ["Authorization"],
		});
		const override = await readMcpServer(home, projectDir, "project", "files");
		expect(override?.kind).toBe("override");
		expect(override).not.toHaveProperty("envKeys");
		expect((await readMcpServer(home, projectDir, "global", "broken"))?.kind).toBe("invalid");
		expect(await readMcpServer(home, projectDir, "global", "none")).toBeUndefined();
	});
});

describe("the keys the form writes", () => {
	test("toolExposure, oauth and auth are written, and clearing them removes the keys", async () => {
		const { home, projectDir } = await scratch();
		await writeMcpServer(home, projectDir, {
			scope: "global",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
			toolExposure: { "search_*": "direct", delete_all: "hidden" },
			oauth: { clientId: "client", callbackPort: 8080, scope: "read write" },
			authProvider: "openai",
		});
		expect((await stored(home.mcpFile)).mcpServers.docs).toMatchObject({
			url: "https://example.test/mcp",
			toolExposure: { "search_*": "direct", delete_all: "hidden" },
			oauth: { clientId: "client", callbackPort: 8080, scope: "read write" },
			auth: { provider: "openai" },
		});

		await writeMcpServer(home, projectDir, {
			scope: "global",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
		});
		const docs = (await stored(home.mcpFile)).mcpServers.docs;
		expect(docs).toEqual({ url: "https://example.test/mcp" });
	});

	test("a blank client secret keeps the stored one and an unknown oauth key survives", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				mcpServers: {
					docs: {
						url: "https://example.test/mcp",
						oauth: { clientId: "old", clientSecret: "secret", futureOption: "keep" },
					},
				},
			}),
		);
		await writeMcpServer(home, projectDir, {
			scope: "global",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
			oauth: { clientId: "new", clientSecret: "" },
		});
		expect((await stored(home.mcpFile)).mcpServers.docs.oauth).toEqual({
			clientId: "new",
			clientSecret: "secret",
			futureOption: "keep",
		});
	});

	test("a project file never carries auth, which pi refuses there", async () => {
		const { home, projectDir } = await scratch();
		await writeMcpServer(home, projectDir, {
			scope: "project",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
			authProvider: "openai",
		});
		const file = JSON.parse(await readFile(join(projectDir, ".pi", "mcp.json"), "utf8"));
		expect(file.mcpServers.docs).toEqual({ url: "https://example.test/mcp" });
	});

	test("a save pi would skip is refused with pi's reason and the file is unchanged", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(home.mcpFile, JSON.stringify({ mcpServers: {} }));
		await expect(
			writeMcpServer(home, projectDir, {
				scope: "global",
				name: "docs",
				transport: "http",
				url: "https://example.test/mcp",
				oauth: { callbackUrl: "http://127.0.0.1:8080/callback?x=1" },
			}),
		).rejects.toThrow("query or a fragment");
		expect((await stored(home.mcpFile)).mcpServers).toEqual({});
	});

	test("an invalid entry is prefilled from its raw target and repaired by a save", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				mcpServers: { files: { command: "npx", args: ["-y", "pkg"], exposure: "loud" } },
			}),
		);
		expect(await readMcpServer(home, projectDir, "global", "files")).toMatchObject({
			kind: "invalid",
			transport: "stdio",
			command: "npx",
			args: ["-y", "pkg"],
		});

		await writeMcpServer(home, projectDir, {
			scope: "global",
			name: "files",
			transport: "stdio",
			command: "npx",
			args: ["-y", "pkg"],
			exposure: "direct",
		});
		expect((await stored(home.mcpFile)).mcpServers.files).toEqual({
			command: "npx",
			args: ["-y", "pkg"],
			exposure: "direct",
		});
	});

	test("an invalid entry's detail carries the tool options pi would still accept", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				mcpServers: { files: { command: "npx", exposure: "direct", timeout: -1 } },
			}),
		);
		const detail = await readMcpServer(home, projectDir, "global", "files");
		expect(detail).toMatchObject({ kind: "invalid", exposure: "direct" });
		expect(detail).not.toHaveProperty("timeout");
	});
});

describe("autoEnableCodemode", () => {
	test("off writes false and on removes the key", async () => {
		const { home, projectDir } = await scratch();
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "global", enabled: false });
		expect((await stored(home.mcpFile)).autoEnableCodemode).toBe(false);

		await setMcpAutoEnableCodemode(home, projectDir, { scope: "global", enabled: true });
		expect(await stored(home.mcpFile)).toEqual({ mcpServers: {} });
	});

	test("on writes true when the other file turns it off, or the other false would win", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(home.mcpFile, JSON.stringify({ autoEnableCodemode: false, mcpServers: {} }));
		await writeMcpServer(home, projectDir, {
			scope: "project",
			name: "docs",
			transport: "http",
			url: "https://example.test/mcp",
		});
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "project", enabled: true });
		const file = JSON.parse(await readFile(join(projectDir, ".pi", "mcp.json"), "utf8"));
		expect(file.autoEnableCodemode).toBe(true);
	});
});

describe("what a session can reach", () => {
	const seedCodemodeServer = async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({
				mcpServers: {
					files: { command: "npx", exposure: "codemode" },
					docs: { command: "npx", exposure: "direct" },
				},
			}),
		);
		return { home, projectDir };
	};

	test("a codemode server is unreachable while auto-enable is off", async () => {
		const { home, projectDir } = await seedCodemodeServer();
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "global", enabled: false });
		const listing = await listMcpServers(home, projectDir);
		expect(listing.reach).toMatchObject({
			autoEnableCodemode: { global: false },
			codemodeDefault: false,
			unreachable: [{ name: "files", exposures: ["codemode"] }],
		});
	});

	test("defaultTools naming codemode keeps it reachable", async () => {
		const { home, projectDir } = await seedCodemodeServer();
		await writeFile(
			join(home.dir, "settings.json"),
			JSON.stringify({ defaultTools: ["+codemode"] }),
		);
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "global", enabled: false });
		const listing = await listMcpServers(home, projectDir);
		expect(listing.reach).toMatchObject({ codemodeDefault: true, unreachable: [] });
	});

	test("a project value overrides the global one", async () => {
		const { home, projectDir } = await seedCodemodeServer();
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "global", enabled: false });
		await setMcpAutoEnableCodemode(home, projectDir, { scope: "project", enabled: true });
		const listing = await listMcpServers(home, projectDir);
		expect(listing.reach).toMatchObject({
			autoEnableCodemode: { global: false, project: true },
			unreachable: [],
		});
	});
});

describe("the runtime diagnostics of one server", () => {
	test("the log tail and the stored credentials are read without a token", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({ mcpServers: { docs: { url: "https://example.test/mcp" } } }),
		);
		await writeFile(
			home.mcpLogFile,
			[
				"2026-01-01T00:00:00Z [other] info x: not mine",
				"2026-01-01T00:00:01Z [docs] info fetch: started",
				"2026-01-01T00:00:02Z [docs] error fetch: failed",
			].join("\n"),
		);
		await writeFile(
			home.mcpAuthFile,
			JSON.stringify({ "mcp__docs|https://example.test/mcp": { tokens: { access: "secret" } } }),
		);
		const detail = await readMcpServer(home, projectDir, "global", "docs");
		expect(detail).toMatchObject({ kind: "server", credentialsStored: true });
		expect(detail?.kind === "server" && detail.log).toEqual([
			"2026-01-01T00:00:01Z [docs] info fetch: started",
			"2026-01-01T00:00:02Z [docs] error fetch: failed",
		]);
		expect(JSON.stringify(detail)).not.toContain("secret");
	});

	test("a server that only spoke before pi rotated the log is still read", async () => {
		const { home, projectDir } = await scratch();
		await writeFile(
			home.mcpFile,
			JSON.stringify({ mcpServers: { docs: { url: "https://example.test/mcp" } } }),
		);
		await writeFile(home.mcpLogFile, "2026-01-02T00:00:00Z [other] info x: not mine\n");
		await writeFile(home.mcpLogRotatedFile, "2026-01-01T00:00:00Z [docs] info fetch: started\n");
		const detail = await readMcpServer(home, projectDir, "global", "docs");
		expect(detail?.kind === "server" && detail.log).toEqual([
			"2026-01-01T00:00:00Z [docs] info fetch: started",
		]);
	});
});
