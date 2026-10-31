/** Bundled skill files use real files in a temporary skills root. */
import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

import {
	deleteSkillBundleFile,
	listSkillFiles,
	readSkillBundleFile,
	writeSkillBundleFile,
} from "./files";

const skillsRoot = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "epsilon-bundle-"));
	await mkdir(join(root, "probe"), { recursive: true });
	await writeFile(join(root, "probe", "SKILL.md"), "---\nname: probe\ndescription: x\n---\n");
	return root;
};

describe("bundled skill files", () => {
	test("lists text and binary files, skipping stripped paths and symlinks", async () => {
		const root = await skillsRoot();
		const dir = join(root, "probe");
		await mkdir(join(dir, "scripts"));
		await mkdir(join(dir, "node_modules"));
		await mkdir(join(dir, ".git"));
		await writeFile(join(dir, "scripts", "run.sh"), "echo hi\n");
		await writeFile(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0, 1, 2]));
		await writeFile(join(dir, "latin.txt"), Buffer.from([0xe9, 0x63, 0x63]));
		await writeFile(join(dir, ".DS_Store"), "x");
		await writeFile(join(dir, "node_modules", "a.js"), "x");
		await writeFile(join(dir, ".git", "HEAD"), "x");
		await symlink(join(dir, "SKILL.md"), join(dir, "link.md"));

		const list = await listSkillFiles(root, "probe");
		expect(list.skipped).toBe(1);
		expect(list.files.map((f) => [f.path, f.text])).toEqual([
			["SKILL.md", true],
			["latin.txt", false],
			["logo.png", false],
			["scripts/run.sh", true],
		]);
	});

	test("writes, reads and deletes, cleaning empty parents", async () => {
		const root = await skillsRoot();
		await writeSkillBundleFile(root, "probe", "references/deep/a.md", "# A\n");
		expect(await readSkillBundleFile(root, "probe", "references/deep/a.md")).toBe("# A\n");
		await writeSkillBundleFile(root, "probe", "references/b.md", "b");

		await deleteSkillBundleFile(root, "probe", "references/deep/a.md");
		expect(existsSync(join(root, "probe", "references", "deep"))).toBe(false);
		expect(existsSync(join(root, "probe", "references"))).toBe(true);

		await deleteSkillBundleFile(root, "probe", "references/b.md");
		expect(existsSync(join(root, "probe", "references"))).toBe(false);
		expect(existsSync(join(root, "probe", "SKILL.md"))).toBe(true);
	});

	test("keeps the exec bit when a script is edited", async () => {
		const root = await skillsRoot();
		const script = join(root, "probe", "run.sh");
		await writeFile(script, "echo 1\n");
		await chmod(script, 0o755);
		await writeSkillBundleFile(root, "probe", "run.sh", "echo 2\n");
		expect((await stat(script)).mode & 0o777).toBe(0o755);
		expect(await readFile(script, "utf8")).toBe("echo 2\n");
	});

	test("refuses SKILL.md, unsafe and stripped paths", async () => {
		const root = await skillsRoot();
		for (const path of [
			"SKILL.md",
			"../x",
			"a/../../x",
			"/etc/x",
			"a\\b",
			"a//b",
			".git/config",
			"n/node_modules/x",
		]) {
			await expect(writeSkillBundleFile(root, "probe", path, "x")).rejects.toThrow();
			await expect(readSkillBundleFile(root, "probe", path)).rejects.toThrow();
			await expect(deleteSkillBundleFile(root, "probe", path)).rejects.toThrow();
		}
		await expect(readSkillBundleFile(root, "probe", "SKILL.md")).rejects.toThrow(/skill form/);
	});

	test("refuses a symlinked file or folder and writes nothing through it", async () => {
		const root = await skillsRoot();
		const outside = await mkdtemp(join(tmpdir(), "epsilon-outside-"));
		await writeFile(join(outside, "secret.txt"), "secret");
		await symlink(outside, join(root, "probe", "linked"));
		await symlink(join(outside, "secret.txt"), join(root, "probe", "file.txt"));

		await expect(readSkillBundleFile(root, "probe", "linked/secret.txt")).rejects.toThrow(
			/symlink/,
		);
		await expect(writeSkillBundleFile(root, "probe", "linked/new.txt", "x")).rejects.toThrow(
			/symlink/,
		);
		await expect(writeSkillBundleFile(root, "probe", "file.txt", "x")).rejects.toThrow(/symlink/);
		await expect(deleteSkillBundleFile(root, "probe", "file.txt")).rejects.toThrow(/symlink/);
		expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("secret");
		expect(existsSync(join(outside, "new.txt"))).toBe(false);
	});

	test("refuses binary and oversized reads, and a missing skill", async () => {
		const root = await skillsRoot();
		await writeFile(join(root, "probe", "bin"), Buffer.from([1, 0, 2]));
		await writeFile(join(root, "probe", "big.txt"), "a".repeat(1024 * 1024 + 1));
		await expect(readSkillBundleFile(root, "probe", "bin")).rejects.toThrow(/binary/);
		await expect(readSkillBundleFile(root, "probe", "big.txt")).rejects.toThrow(/1 MB/);
		await expect(readSkillBundleFile(root, "probe", "missing.txt")).rejects.toThrow(
			/does not exist/,
		);
		await expect(listSkillFiles(root, "nope")).rejects.toThrow(/No skill/);
		await expect(listSkillFiles(root, "../probe")).rejects.toThrow();
	});

	test("refuses a write that takes the folder past the size limit", async () => {
		const root = await skillsRoot();
		const chunk = "a".repeat(4 * 1024 * 1024);
		for (let i = 0; i < 6; i += 1) await writeFile(join(root, "probe", `f${i}.txt`), chunk);
		await expect(writeSkillBundleFile(root, "probe", "more.txt", chunk)).rejects.toThrow(/25 MB/);
		// Replacing an existing file counts only the difference.
		await writeSkillBundleFile(root, "probe", "f0.txt", chunk);
		expect(existsSync(join(root, "probe", "more.txt"))).toBe(false);
	});

	test("follows a linked skill folder only into another editable skills folder", async () => {
		const shared = await skillsRoot();
		const home = await mkdtemp(join(tmpdir(), "epsilon-bundle-home-"));
		await symlink(join(shared, "probe"), join(home, "probe"));
		await writeFile(join(shared, "probe", "notes.md"), "hi");

		expect((await listSkillFiles(home, "probe", [shared])).files.map((f) => f.path)).toEqual([
			"SKILL.md",
			"notes.md",
		]);
		await writeSkillBundleFile(home, "probe", "more.md", "x", [shared]);
		expect(await readFile(join(shared, "probe", "more.md"), "utf8")).toBe("x");

		const elsewhere = await skillsRoot();
		await symlink(join(elsewhere, "probe"), join(home, "stray"));
		await expect(listSkillFiles(home, "stray", [shared])).rejects.toThrow(/links outside/);
	});
});
