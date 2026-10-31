/**
 * The read-only route serves the text of a skill pi lists, wherever it lives, and
 * nothing else: the path from the browser is checked against the inventory.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "./app";
import { agentHome } from "./platform/agent-home";
import { SessionRegistry } from "./features/conversation/registry";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-skill-routes-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

const fresh = async () => {
	const home = agentHome(await mkdtemp(join(scratch, "agent-")));
	await mkdir(home.chatsDir, { recursive: true });
	const app = createApp({
		home,
		userHome: join(scratch, "user"),
		engines: new SessionRegistry(home),
	});
	return { home, app };
};

const read = (app: Awaited<ReturnType<typeof fresh>>["app"], filePath: string) =>
	app.request(`/api/settings/skills/listed?filePath=${encodeURIComponent(filePath)}`);

describe("GET /api/settings/skills/listed", () => {
	test("returns the parsed file of a listed skill", async () => {
		const { home, app } = await fresh();
		await mkdir(join(home.skillsDir, "probe"), { recursive: true });
		const filePath = join(home.skillsDir, "probe", "SKILL.md");
		await writeFile(
			filePath,
			"---\nname: probe\ndescription: A probe\nlicense: MIT\nallowed-tools: Read\n---\n\nDo it.\n",
		);

		const response = await read(app, filePath);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			name: "probe",
			filePath,
			description: "A probe",
			body: "Do it.",
			license: "MIT",
			modelInvocation: true,
		});
		expect(body.fields.map((field: { key: string }) => field.key)).toEqual(["allowed-tools"]);
	});

	test("refuses a file the inventory does not list", async () => {
		const { home, app } = await fresh();
		const stray = join(scratch, "stray", "SKILL.md");
		await mkdir(join(scratch, "stray"), { recursive: true });
		await writeFile(stray, "---\ndescription: Not listed\n---\n\nSecret\n");

		expect((await read(app, stray)).status).toBe(404);
		expect((await read(app, join(home.dir, "auth.json"))).status).toBe(404);
		expect((await read(app, join(home.skillsDir, "..", "..", "etc", "passwd"))).status).toBe(404);
	});
});

describe("listed skill files and raw SKILL.md routes", () => {
	const get = (
		app: Awaited<ReturnType<typeof fresh>>["app"],
		path: string,
		query: Record<string, string>,
	) => app.request(`${path}?${new URLSearchParams(query)}`);

	test("list and read files of a listed skill, and refuse any other path", async () => {
		const { home, app } = await fresh();
		const dir = join(home.skillsDir, "probe");
		await mkdir(join(dir, "references"), { recursive: true });
		const filePath = join(dir, "SKILL.md");
		await writeFile(filePath, "---\nname: probe\ndescription: A probe\n---\n\nDo it.\n");
		await writeFile(join(dir, "references", "a.md"), "# A\n");

		const list = await get(app, "/api/settings/skills/listed-files", { filePath });
		expect(list.status).toBe(200);
		expect((await list.json()).files.map((f: { path: string }) => f.path)).toEqual([
			"SKILL.md",
			"references/a.md",
		]);
		const file = await get(app, "/api/settings/skills/listed-file", {
			filePath,
			path: "references/a.md",
		});
		expect(await file.json()).toEqual({ path: "references/a.md", text: "# A\n" });
		const main = await get(app, "/api/settings/skills/listed-file", { filePath, path: "SKILL.md" });
		expect((await main.json()).text).toContain("Do it.");

		const escape = await get(app, "/api/settings/skills/listed-file", {
			filePath,
			path: "../../auth.json",
		});
		expect(escape.status).toBe(400);

		const stray = join(scratch, "stray", "SKILL.md");
		await mkdir(join(scratch, "stray"), { recursive: true });
		await writeFile(stray, "---\ndescription: Not listed\n---\n");
		expect((await get(app, "/api/settings/skills/listed-files", { filePath: stray })).status).toBe(
			404,
		);
		expect(
			(await get(app, "/api/settings/skills/listed-file", { filePath: stray, path: "SKILL.md" }))
				.status,
		).toBe(404);
	});

	test("GET and PUT the raw SKILL.md of an editable skill", async () => {
		const { home, app } = await fresh();
		const dir = join(home.skillsDir, "probe");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "SKILL.md"), "---\nname: probe\ndescription: old\n---\n");
		const url = "/api/settings/skills/home/probe/raw";

		const text = "---\nname: probe\ndescription:    new   one\n# keep me\n---\nBody\n";
		const put = await app.request(url, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text }),
		});
		expect(put.status).toBe(204);
		expect(await Bun.file(join(dir, "SKILL.md")).text()).toBe(text);
		expect(await (await app.request(url)).json()).toEqual({ path: "SKILL.md", text });

		const refused = await app.request(url, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "---\nname: other\ndescription: x\n---\n" }),
		});
		expect(refused.status).toBe(400);
		expect((await refused.json()).message).toContain('must match the folder name "probe"');
		expect(await Bun.file(join(dir, "SKILL.md")).text()).toBe(text);
	});
});
