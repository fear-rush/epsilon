/**
 * The context panel asks pi what steers the model, so these checks build a real
 * agent home and project with the files pi reads and open a real engine for the live
 * half. `HOME` points at a scratch folder so pi's `~/.agents/skills` is never the
 * real one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { projectTrustStore } from "../../platform/pi";
import { SessionRegistry } from "../conversation";
import { readContext } from "./service";
import { readFiles } from "./store";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await realpath(await mkdtemp(join(tmpdir(), "epsilon-context-")));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

/** A home and a trusted project, each with the prompt and context files pi reads. */
const scratchCase = async () => {
	const base = await realpath(await mkdtemp(join(scratch, "case-")));
	const home = agentHome(join(base, "agent"));
	await mkdir(home.chatsDir, { recursive: true });
	await writeFile(join(home.dir, "AGENTS.md"), "Home rules.\n", "utf8");
	await writeFile(join(home.dir, "SYSTEM.md"), "HOME PROMPT\n", "utf8");
	const project = join(base, "project");
	await mkdir(join(project, ".pi"), { recursive: true });
	await writeFile(join(project, "AGENTS.md"), "Project rules.\n", "utf8");
	await writeFile(join(project, ".pi", "SYSTEM.md"), "PROJECT PROMPT\n", "utf8");
	projectTrustStore(home).set(project, true);
	return { base, home, project };
};

describe("the context files pi loads", () => {
	test("reports the context files, the project prompt and a skill with no chat open", async () => {
		const { home, project } = await scratchCase();
		const skillDir = join(home.skillsDir, "review");
		await mkdir(skillDir, { recursive: true });
		await writeFile(
			join(skillDir, "SKILL.md"),
			"---\nname: review\ndescription: Review a diff\n---\n\nBody\n",
			"utf8",
		);

		const files = await readFiles(project, home);
		const paths = files.contextFiles.map((file) => file.path);
		expect(paths).toContain(join(home.dir, "AGENTS.md"));
		expect(paths).toContain(join(project, "AGENTS.md"));
		// pi applies the home's file first and the working folder's last.
		expect(paths.at(0)).toBe(join(home.dir, "AGENTS.md"));
		expect(paths.at(-1)).toBe(join(project, "AGENTS.md"));
		expect(files.contextFiles.map((file) => file.order)).toEqual(
			paths.map((_, index) => index + 1),
		);

		expect(files.systemPrompt).toEqual({
			source: "project",
			replacePath: join(project, ".pi", "SYSTEM.md"),
			appendPaths: [],
		});

		const view = await readContext(project, home, new SessionRegistry(home));
		expect(view.live).toBe(false);
		expect(view.tools).toBeUndefined();
		expect(view.skills.map((skill) => [skill.name, skill.filePath])).toEqual([
			["review", join(skillDir, "SKILL.md")],
		]);
	});

	test("an agent home with no project prompt reports the home's own files", async () => {
		const { home } = await scratchCase();
		const files = await readFiles(home.chatsDir, home);
		expect(files.systemPrompt).toEqual({
			source: "agent",
			replacePath: join(home.dir, "SYSTEM.md"),
			appendPaths: [],
		});
	});

	test("a live chat answers with the prompt it sends and the tools it offers", async () => {
		const { home, project } = await scratchCase();
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), {
				kind: "project",
				path: project,
			});
			const view = await readContext(project, home, registry);

			expect(view.live).toBe(true);
			expect(view.liveSessionId).toBe(session.sessionId);
			// The project's own SYSTEM.md replaced pi's prompt, and this is the text sent.
			expect(view.systemPrompt.text).toContain("PROJECT PROMPT");
			expect(view.contextUsage).toBeUndefined();
			expect(view.tools?.all.length).toBeGreaterThan(0);
			expect(view.tools?.active).toEqual(session.contextLive()?.tools.active);
		} finally {
			await registry.disposeAll();
		}
	});
});
