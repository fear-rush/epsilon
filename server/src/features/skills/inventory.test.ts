/**
 * The inventory is pi's own answer, so these checks build real skill folders in
 * a temporary agent home and project and read what pi resolves. `HOME` points at
 * a scratch folder so pi's `~/.agents/skills` is never the real one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import type { AgentHome } from "../../platform/agent-home";
import { linkSkillFolder, listForeignSkills, unlinkSkillFolder } from "./foreign";
import { listSkills, untrustedSkills } from "./inventory";
import { setSkillEnabled } from "./toggle";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-inventory-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

const skill = async (dir: string, name: string, head: string, body = "Body"): Promise<string> => {
	await mkdir(join(dir, name), { recursive: true });
	const path = join(dir, name, "SKILL.md");
	await writeFile(path, `---\n${head}\n---\n\n${body}\n`);
	return path;
};

const fresh = async (): Promise<{ home: AgentHome; project: string; userHome: string }> => {
	const base = await mkdtemp(join(scratch, "case-"));
	const home = agentHome(join(base, "agent"));
	await mkdir(home.chatsDir, { recursive: true });
	const project = join(base, "project");
	await mkdir(project, { recursive: true });
	return { home, project, userHome: join(base, "user") };
};

describe("skill inventory", () => {
	test("labels active, manual, invalid and warning cases", async () => {
		const { home } = await fresh();
		await skill(home.skillsDir, "plain", "name: plain\ndescription: Plain skill");
		await skill(
			home.skillsDir,
			"manual",
			"name: manual\ndescription: Manual only\ndisable-model-invocation: true",
		);
		await skill(home.skillsDir, "nodesc", "name: nodesc");
		await skill(
			home.skillsDir,
			"renamed",
			"name: other\ndescription: Name differs\nargument-hint: x",
			"Use $ARGUMENTS",
		);

		const views = await listSkills(home.chatsDir, home, null);
		const by = (name: string) => views.find((view) => view.name === name);
		expect(by("plain")).toMatchObject({
			status: "active",
			origin: "home",
			editable: true,
			root: "home",
			modelInvocation: true,
			toggle: "settings",
		});
		expect(by("manual")).toMatchObject({ status: "manual", modelInvocation: false });
		expect(by("nodesc")).toMatchObject({ status: "invalid", editable: true });
		expect(by("nodesc")?.message).toContain("description is required");
		const renamed = by("other");
		expect(renamed?.warnings.join("\n")).toContain('differs from the folder "renamed"');
		expect(renamed?.warnings.join("\n")).toContain("argument-hint");
		expect(renamed?.warnings.join("\n")).toContain("$ARGUMENTS");
	});

	test("marks a name collision loser as shadowed by the winner", async () => {
		const { home, project } = await fresh();
		const winner = await skill(
			join(project, ".pi", "skills"),
			"dup",
			"name: dup\ndescription: Project copy",
		);
		const loser = await skill(home.skillsDir, "dup", "name: dup\ndescription: Home copy");

		const views = (await listSkills(project, home, project)).filter((view) => view.name === "dup");
		expect(views.map((view) => [view.origin, view.status]).sort()).toEqual([
			["home", "shadowed"],
			["project-pi", "active"],
		]);
		expect(views.find((view) => view.filePath === loser)?.shadowedBy).toBe(winner);
	});

	test("an override turns a skill off and the toggle round-trips", async () => {
		const { home } = await fresh();
		const path = await skill(home.skillsDir, "toggled", "name: toggled\ndescription: Switch me");

		await setSkillEnabled(home.chatsDir, home, null, path, false);
		expect(JSON.parse(await readFile(home.dir + "/settings.json", "utf8")).skills).toEqual([
			`-${join(home.skillsDir, "toggled")}`,
		]);
		let view = (await listSkills(home.chatsDir, home, null)).find(
			(entry) => entry.name === "toggled",
		);
		expect(view?.status).toBe("disabled");

		await setSkillEnabled(home.chatsDir, home, null, path, true);
		view = (await listSkills(home.chatsDir, home, null)).find((entry) => entry.name === "toggled");
		expect(view?.status).toBe("active");
	});

	test("refuses a path the inventory does not list", async () => {
		const { home } = await fresh();
		await expect(setSkillEnabled(home.chatsDir, home, null, "/etc/passwd", false)).rejects.toThrow(
			"No such skill",
		);
	});

	test("project .agents skills are listed and editable only directly under the project", async () => {
		const { home, project } = await fresh();
		await skill(
			join(project, ".agents", "skills"),
			"shared",
			"name: shared\ndescription: Shared skill",
		);
		const view = (await listSkills(project, home, project)).find(
			(entry) => entry.name === "shared",
		);
		expect(view).toMatchObject({
			origin: "project-agents",
			scope: "project",
			root: "project-agents",
			editable: true,
		});
	});

	test("lists an untrusted project's skill files without loading them", async () => {
		const { project } = await fresh();
		await skill(join(project, ".pi", "skills"), "held", "name: held\ndescription: Not yet");
		const views = await untrustedSkills(project);
		expect(views).toHaveLength(1);
		expect(views[0]).toMatchObject({
			name: "held",
			status: "untrusted",
			toggle: "none",
			editable: false,
		});
	});
});

describe("skills of other agents", () => {
	test("detects the folders under the given user home and links them through the setting", async () => {
		const { home, userHome } = await fresh();
		const claude = join(userHome, ".claude", "skills");
		await skill(claude, "from-claude", "name: from-claude\ndescription: Claude's skill");
		await mkdir(join(userHome, ".codex"), { recursive: true });

		let foreign = listForeignSkills(home.chatsDir, home, userHome, null);
		expect(foreign).toHaveLength(1);
		expect(foreign[0]).toMatchObject({
			agent: "claude-code",
			scope: "user",
			folder: claude,
			linked: false,
		});

		await linkSkillFolder(home.chatsDir, home, userHome, null, claude);
		foreign = listForeignSkills(home.chatsDir, home, userHome, null);
		expect(foreign[0]?.linked).toBe(true);
		const linked = (await listSkills(home.chatsDir, home, null)).find(
			(view) => view.name === "from-claude",
		);
		expect(linked).toMatchObject({ origin: "settings-path", status: "active", editable: false });

		await unlinkSkillFolder(home.chatsDir, home, userHome, null, claude);
		expect(listForeignSkills(home.chatsDir, home, userHome, null)[0]?.linked).toBe(false);
	});

	test("refuses a folder that is not a detected foreign folder", async () => {
		const { home, userHome } = await fresh();
		await expect(linkSkillFolder(home.chatsDir, home, userHome, null, "/etc")).rejects.toThrow(
			"not a skill folder",
		);
	});
});
