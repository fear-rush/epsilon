/**
 * The skills root is a boundary: a name arrives from a URL segment, and the
 * module that touches disk must refuse one that would leave it. These checks use
 * real files in a temporary home, not a mock.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listSkills, readSkillFile, removeSkill, writeSkill } from "./skills";

const home = async (): Promise<string> => mkdtemp(join(tmpdir(), "epsilon-skills-"));

describe("user skills", () => {
	test("writes, reads and removes a skill inside the skills root", async () => {
		const root = await home();
		await writeSkill(root, { name: "probe", description: "A probe", body: "Do it." });
		expect((await listSkills(root)).map((skill) => skill.name)).toEqual(["probe"]);

		const file = await readSkillFile(root, "probe");
		expect(file?.description).toBe("A probe");
		expect(file?.body).toBe("Do it.");

		await removeSkill(root, "probe");
		expect(await listSkills(root)).toEqual([]);
	});

	test("refuses a name that would leave the skills root", async () => {
		const root = await home();
		const outside = join(root, "outside");
		await mkdir(outside, { recursive: true });
		await writeFile(join(outside, "SKILL.md"), "---\ndescription: outside\n---\n\nbody\n");

		await expect(readSkillFile(root, "../outside")).rejects.toThrow();
		await expect(removeSkill(root, "../outside")).rejects.toThrow();
		// The refusal is what matters: the file outside the root is still there.
		expect(await readFile(join(outside, "SKILL.md"), "utf8")).toContain("outside");
	});
});
