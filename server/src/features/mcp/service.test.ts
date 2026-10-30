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
import { listMcpServers, readMcpServer, setMcpServerEnabled, writeMcpServer } from "./service";

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
