/**
 * Prompt templates and themes against real settings files and pi's resolver. The
 * list is pi's answer, so these checks read what pi resolved after a write, not
 * what Epsilon thinks it wrote.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { readTemplatePaths, settingsManager, writePromptTemplatePaths } from "../../platform/pi";
import { addTemplatePath, listTemplates, removeTemplatePath } from "./store";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-templates-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

const fresh = async () => {
	const base = await mkdtemp(join(scratch, "case-"));
	const home = agentHome(join(base, "agent"));
	await mkdir(home.chatsDir, { recursive: true });
	return { home, base };
};

describe("prompt templates and themes", () => {
	test("adds a prompt folder, lists its templates, and removes it again", async () => {
		const { home, base } = await fresh();
		const dir = join(base, "prompts");
		await mkdir(dir);
		await writeFile(join(dir, "hello.md"), "---\ndescription: Say hello\n---\n\nHello\n");

		await addTemplatePath(home.chatsDir, home, { kind: "prompts", scope: "user", path: dir });
		expect(readTemplatePaths(home.chatsDir, home, "user", "prompts")).toEqual([dir]);
		const listed = await listTemplates(home.chatsDir, home, "prompts", "user");
		expect(listed.entries.map((entry) => [entry.name, entry.enabled])).toEqual([["hello", true]]);
		expect(listed.entries[0]?.dir).toBe(dir);
		expect(listed.entries[0]?.origin).toBe("top-level");
		expect(listed.entries[0]?.source).toBe("local");

		await expect(
			addTemplatePath(home.chatsDir, home, { kind: "prompts", scope: "user", path: dir }),
		).rejects.toThrow(/already in the prompt template paths/);

		await removeTemplatePath(home.chatsDir, home, {
			kind: "prompts",
			scope: "user",
			path: dir,
		});
		expect(readTemplatePaths(home.chatsDir, home, "user", "prompts")).toEqual([]);
		expect((await listTemplates(home.chatsDir, home, "prompts", "user")).entries).toEqual([]);
	});

	test("reports pi's enabled flag for a path an override excludes", async () => {
		const { home, base } = await fresh();
		const dir = join(base, "prompts");
		await mkdir(dir);
		await writeFile(join(dir, "hello.md"), "---\ndescription: Say hello\n---\n\nHello\n");

		// A prompt entry is the file pi resolved, so an override names the file.
		const file = join(dir, "hello.md");
		await writePromptTemplatePaths(home.chatsDir, home, "user", [dir, `-${file}`]);
		const listed = await listTemplates(home.chatsDir, home, "prompts", "user");
		expect(listed.paths).toEqual([dir, `-${file}`]);
		expect(listed.entries.map((entry) => entry.enabled)).toEqual([false]);
	});

	test("a project list writes to that project's .pi and lists only its own", async () => {
		const { home, base } = await fresh();
		const project = join(base, "project");
		await mkdir(project);
		const dir = join(base, "project-prompts");
		await mkdir(dir);
		await writeFile(join(dir, "review.md"), "---\ndescription: Review\n---\n\nReview\n");

		await addTemplatePath(project, home, { kind: "prompts", scope: "project", path: dir });
		const stored = JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"));
		expect(stored.prompts).toEqual([dir]);
		expect(readTemplatePaths(project, home, "user", "prompts")).toEqual([]);
		const listed = await listTemplates(project, home, "prompts", "project");
		expect(listed.entries.map((entry) => [entry.name, entry.enabled])).toEqual([["review", true]]);
	});

	test("refuses a missing path, a file of another kind, and an entry not listed", async () => {
		const { home, base } = await fresh();
		const missing = join(base, "missing");
		await expect(
			addTemplatePath(home.chatsDir, home, { kind: "prompts", scope: "user", path: missing }),
		).rejects.toThrow(/does not exist/);

		const notes = join(base, "notes.txt");
		await writeFile(notes, "x");
		await expect(
			addTemplatePath(home.chatsDir, home, { kind: "prompts", scope: "user", path: notes }),
		).rejects.toThrow(/folder or a .md file/);

		const theme = join(base, "paper.json");
		await writeFile(theme, "{}");
		await expect(
			addTemplatePath(home.chatsDir, home, { kind: "prompts", scope: "user", path: theme }),
		).rejects.toThrow(/folder or a .md file/);

		await expect(
			removeTemplatePath(home.chatsDir, home, {
				kind: "prompts",
				scope: "user",
				path: join(base, "other.md"),
			}),
		).rejects.toThrow(/not in the prompt template paths/);
	});

	test("lists a theme a terminal configured, and refuses to write a theme path", async () => {
		const { home, base } = await fresh();
		const dir = join(base, "themes");
		await mkdir(dir);
		await writeFile(join(dir, "paper.json"), "{}");
		// A terminal writes the theme path; the dashboard only reads it.
		const settings = settingsManager(home.chatsDir, home);
		settings.setThemePaths([dir]);
		await settings.flush();

		const listed = await listTemplates(home.chatsDir, home, "themes", "user");
		expect(listed.paths).toEqual([dir]);
		expect(listed.entries.map((entry) => [entry.name, entry.enabled])).toEqual([["paper", true]]);

		await expect(
			addTemplatePath(home.chatsDir, home, { kind: "themes", scope: "user", path: dir }),
		).rejects.toThrow(/only changes a terminal/);
		await expect(
			removeTemplatePath(home.chatsDir, home, { kind: "themes", scope: "user", path: dir }),
		).rejects.toThrow(/only changes a terminal/);
	});
});
