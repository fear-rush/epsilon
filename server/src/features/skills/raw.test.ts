/** Raw `SKILL.md` text and the listed-skill reads use real files in temporary folders. */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listListedSkillFiles, readListedSkillFile } from "./files";
import { readRawSkill, writeRawSkill } from "./raw";

const GOOD =
	"---\nname: probe\n# a comment\ndescription:   Does   things\nlicense: MIT\n---\n\n\nBody\n\n";

const skillsRoot = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "epsilon-raw-"));
	await mkdir(join(root, "probe"), { recursive: true });
	await writeFile(join(root, "probe", "SKILL.md"), "---\nname: probe\ndescription: x\n---\n");
	return root;
};

describe("raw SKILL.md", () => {
	test("writes the text byte for byte and reads it back", async () => {
		const root = await skillsRoot();
		await writeRawSkill(root, "probe", GOOD);
		expect(await readFile(join(root, "probe", "SKILL.md"), "utf8")).toBe(GOOD);
		expect(await readRawSkill(root, "probe")).toBe(GOOD);
	});

	test("refuses text that is not a skill file and leaves the file alone", async () => {
		const root = await skillsRoot();
		const before = await readRawSkill(root, "probe");
		const bad: [string, RegExp][] = [
			["no frontmatter", /---/],
			["---\nname: probe\n  bad: [\n---\n", /valid YAML/],
			["---\ndescription: x\n---\n", /needs name: probe/],
			["---\nname: other\ndescription: x\n---\n", /must match the folder name "probe"/],
			["---\nname: probe\n---\n", /description/],
			["---\nname: probe\ndescription: has <b>tags</b>\n---\n", /XML/],
		];
		for (const [text, reason] of bad) {
			await expect(writeRawSkill(root, "probe", text)).rejects.toThrow(reason);
		}
		await expect(writeRawSkill(root, "probe", `${GOOD}${"a".repeat(1024 * 1024)}`)).rejects.toThrow(
			/1 MB/,
		);
		expect(await readRawSkill(root, "probe")).toBe(before);
	});

	test("refuses a missing skill and a name that leaves the root", async () => {
		const root = await skillsRoot();
		await expect(writeRawSkill(root, "nope", GOOD)).rejects.toThrow(/No skill/);
		await expect(readRawSkill(root, "../probe")).rejects.toThrow();
	});

	test("follows a linked skill folder only into another editable skills folder", async () => {
		const shared = await skillsRoot();
		const home = await mkdtemp(join(tmpdir(), "epsilon-raw-home-"));
		await symlink(join(shared, "probe"), join(home, "probe"));

		await writeRawSkill(home, "probe", GOOD, [shared]);
		expect(await readFile(join(shared, "probe", "SKILL.md"), "utf8")).toBe(GOOD);
		expect(await readRawSkill(home, "probe", [shared])).toBe(GOOD);

		const elsewhere = await skillsRoot();
		await symlink(join(elsewhere, "probe"), join(home, "stray"));
		await expect(readRawSkill(home, "stray", [shared])).rejects.toThrow(/links outside/);
		await expect(writeRawSkill(home, "stray", GOOD, [shared])).rejects.toThrow(/links outside/);
	});
});

describe("listed skill files", () => {
	test("lists the folder and reads SKILL.md and bundled files", async () => {
		const root = await skillsRoot();
		const dir = join(root, "probe");
		await mkdir(join(dir, "references"));
		await writeFile(join(dir, "references", "a.md"), "# A\n");
		await writeFile(join(dir, "logo.png"), Buffer.from([0x89, 0, 1]));
		const filePath = join(dir, "SKILL.md");

		const list = await listListedSkillFiles(filePath);
		expect(list.files.map((f) => [f.path, f.text])).toEqual([
			["SKILL.md", true],
			["logo.png", false],
			["references/a.md", true],
		]);
		expect(await readListedSkillFile(filePath, "SKILL.md")).toContain("name: probe");
		expect(await readListedSkillFile(filePath, "references/a.md")).toBe("# A\n");
		await expect(readListedSkillFile(filePath, "logo.png")).rejects.toThrow(/binary/);
	});

	test("applies the bundle path checks", async () => {
		const root = await skillsRoot();
		const dir = join(root, "probe");
		const outside = await mkdtemp(join(tmpdir(), "epsilon-raw-outside-"));
		await writeFile(join(outside, "secret.txt"), "secret");
		await symlink(outside, join(dir, "linked"));
		await mkdir(join(dir, "node_modules"));
		await writeFile(join(dir, "node_modules", "a.js"), "x");
		const filePath = join(dir, "SKILL.md");

		for (const path of ["../x", "a/../../x", "/etc/passwd", "a\\b", "node_modules/a.js"]) {
			await expect(readListedSkillFile(filePath, path)).rejects.toThrow();
		}
		await expect(readListedSkillFile(filePath, "linked/secret.txt")).rejects.toThrow(/symlink/);
		await expect(readListedSkillFile(filePath, "missing.md")).rejects.toThrow(/does not exist/);
	});

	test("a lone markdown file lists and reads only itself", async () => {
		const root = await mkdtemp(join(tmpdir(), "epsilon-raw-lone-"));
		const filePath = join(root, "lone.md");
		await writeFile(filePath, "---\ndescription: d\n---\n");
		await writeFile(join(root, "neighbour.md"), "private");

		expect((await listListedSkillFiles(filePath)).files.map((f) => f.path)).toEqual(["lone.md"]);
		expect(await readListedSkillFile(filePath, "lone.md")).toContain("description: d");
		await expect(readListedSkillFile(filePath, "neighbour.md")).rejects.toThrow(/not part/);
	});
});
