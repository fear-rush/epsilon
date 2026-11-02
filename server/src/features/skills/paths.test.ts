/**
 * Arbitrary skill paths against real settings files and pi's resolver: any folder,
 * or one `.md` file, added to the `skills` setting is read where it is.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { writeSkillEntries } from "../../platform/pi";
import { listSkills } from "./inventory";
import { addSkillPath, removeSkillPath, skillSourcePaths } from "./paths";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-skill-paths-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

const fresh = async () => {
	const dir = await mkdtemp(join(scratch, "case-"));
	const home = agentHome(dir);
	await mkdir(home.chatsDir, { recursive: true });
	return { dir, home };
};

const skill = async (container: string, name: string): Promise<void> => {
	await mkdir(join(container, name), { recursive: true });
	await writeFile(
		join(container, name, "SKILL.md"),
		`---\nname: ${name}\ndescription: The ${name} skill\n---\n\nBody\n`,
	);
};

describe("skill paths", () => {
	test("adds a folder, shows its skills, and removes it again", async () => {
		const { dir, home } = await fresh();
		const shared = join(dir, "shared-skills");
		await skill(shared, "alpha");
		await skill(shared, "beta");

		await addSkillPath(home.chatsDir, home, "user", shared);
		expect(skillSourcePaths(home.chatsDir, home, "user")).toEqual([shared]);
		const listed = await listSkills(home.chatsDir, home, null);
		expect(
			listed
				.filter((entry) => entry.origin === "settings-path")
				.map((entry) => entry.name)
				.sort(),
		).toEqual(["alpha", "beta"]);
		expect(listed.find((entry) => entry.name === "alpha")?.status).toBe("active");

		// The same path twice is still one source.
		await addSkillPath(home.chatsDir, home, "user", shared);
		expect(skillSourcePaths(home.chatsDir, home, "user")).toEqual([shared]);

		await removeSkillPath(home.chatsDir, home, "user", shared);
		expect(skillSourcePaths(home.chatsDir, home, "user")).toEqual([]);
		expect(
			(await listSkills(home.chatsDir, home, null)).some(
				(entry) => entry.origin === "settings-path",
			),
		).toBe(false);
	});

	test("adds one .md file as a skill", async () => {
		const { dir, home } = await fresh();
		const file = join(dir, "solo.md");
		await writeFile(file, "---\nname: solo\ndescription: A solo skill\n---\n\nBody\n");

		await addSkillPath(home.chatsDir, home, "user", file);
		const solo = (await listSkills(home.chatsDir, home, null)).find(
			(entry) => entry.filePath === file,
		);
		expect(solo).toMatchObject({ name: "solo", origin: "settings-path", status: "active" });
	});

	test("adding a skill folder a -path switch hid makes it load", async () => {
		const { dir, home } = await fresh();
		const shared = join(dir, "shared-skills");
		await skill(shared, "alpha");
		const alpha = join(shared, "alpha");
		await writeSkillEntries(home.chatsDir, home, "user", [alpha, `-${alpha}`]);
		expect(
			(await listSkills(home.chatsDir, home, null)).find((entry) => entry.name === "alpha")?.status,
		).toBe("disabled");

		await addSkillPath(home.chatsDir, home, "user", alpha);
		expect(skillSourcePaths(home.chatsDir, home, "user")).toEqual([alpha]);
		expect(
			(await listSkills(home.chatsDir, home, null)).find((entry) => entry.name === "alpha")?.status,
		).toBe("active");
	});

	test("refuses a missing path, a file pi cannot read as a skill, and one not listed", async () => {
		const { dir, home } = await fresh();
		await expect(addSkillPath(home.chatsDir, home, "user", join(dir, "missing"))).rejects.toThrow(
			/does not exist/,
		);
		const notes = join(dir, "notes.txt");
		await writeFile(notes, "x");
		await expect(addSkillPath(home.chatsDir, home, "user", notes)).rejects.toThrow(
			/folder or a .md file/,
		);
		await expect(removeSkillPath(home.chatsDir, home, "user", join(dir, "other"))).rejects.toThrow(
			/not in the skills setting/,
		);
	});
});
