/**
 * The Raw tab edits one entry as text. These checks read the real file back:
 * secrets leave as the sentinel and return as what the file held, a refusal
 * writes nothing, and no other key of the file moves.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { readMcpRaw, writeMcpRaw } from "./raw";

const seed = async () => {
	const home = agentHome(await mkdtemp(join(tmpdir(), "epsilon-mcp-raw-")));
	const projectDir = await mkdtemp(join(tmpdir(), "epsilon-mcp-raw-project-"));
	const file = {
		futureTopLevel: 1,
		mcpServers: {
			files: {
				command: "npx",
				env: { TOKEN: "secret" },
				futureKey: { a: 1 },
				oauth: { clientId: "id", clientSecret: "shh", extra: "x" },
			},
			docs: { url: "https://example.test/mcp", headers: { Authorization: "bearer" } },
		},
	};
	await writeFile(home.mcpFile, JSON.stringify(file));
	return { home, projectDir, file };
};

const stored = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("mcp raw entry", () => {
	test("hides every stored secret and shows the rest", async () => {
		const { home, projectDir } = await seed();
		const text = await readMcpRaw(home, projectDir, "global", "files");
		expect(text).not.toContain("secret");
		expect(text).not.toContain("shh");
		expect(JSON.parse(text ?? "")).toEqual({
			command: "npx",
			env: { TOKEN: "<stored>" },
			futureKey: { a: 1 },
			oauth: { clientId: "id", clientSecret: "<stored>", extra: "<stored>" },
		});
		expect(await readMcpRaw(home, projectDir, "global", "nope")).toBeUndefined();
	});

	test("round trip keeps the sentinel's stored value, unknown keys and other servers", async () => {
		const { home, projectDir, file } = await seed();
		const text = (await readMcpRaw(home, projectDir, "global", "files")) ?? "";
		const edited = text.replace('"npx"', '"bunx"');
		await writeMcpRaw(home, projectDir, "global", "files", edited);
		const after = await stored(home.mcpFile);
		expect(after.futureTopLevel).toBe(1);
		expect(after.mcpServers.docs).toEqual(file.mcpServers.docs);
		expect(after.mcpServers.files).toEqual({ ...file.mcpServers.files, command: "bunx" });
	});

	test("a new value replaces a secret and a removed key is removed", async () => {
		const { home, projectDir } = await seed();
		await writeMcpRaw(
			home,
			projectDir,
			"global",
			"files",
			JSON.stringify({ command: "npx", env: { TOKEN: "new" }, added: true }),
		);
		expect((await stored(home.mcpFile)).mcpServers.files).toEqual({
			command: "npx",
			env: { TOKEN: "new" },
			added: true,
		});
	});

	test("invalid JSON, a sentinel with nothing stored and an invalid entry write nothing", async () => {
		const { home, projectDir } = await seed();
		const before = await readFile(home.mcpFile, "utf8");
		await expect(writeMcpRaw(home, projectDir, "global", "files", "{ nope")).rejects.toThrow();
		await expect(
			writeMcpRaw(
				home,
				projectDir,
				"global",
				"files",
				JSON.stringify({ command: "npx", env: { OTHER: "<stored>" } }),
			),
		).rejects.toThrow('"env.OTHER" has no stored value');
		await expect(
			writeMcpRaw(home, projectDir, "global", "files", JSON.stringify({ command: 3 })),
		).rejects.toThrow();
		await expect(writeMcpRaw(home, projectDir, "global", "files", "[1]")).rejects.toThrow(
			"must be a JSON object",
		);
		expect(await readFile(home.mcpFile, "utf8")).toBe(before);
	});

	test("a project entry is written to the project file only", async () => {
		const { home, projectDir, file } = await seed();
		await writeMcpRaw(
			home,
			projectDir,
			"project",
			"local",
			JSON.stringify({ command: "node", args: ["x"] }),
		);
		expect(await stored(join(projectDir, ".pi", "mcp.json"))).toEqual({
			mcpServers: { local: { command: "node", args: ["x"] } },
		});
		expect(await stored(home.mcpFile)).toEqual(file);
	});
});
