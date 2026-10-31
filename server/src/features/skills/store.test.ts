/**
 * The skills root is a boundary: a name arrives from a URL segment, and the
 * module that touches disk must refuse one that would leave it. These checks use
 * real files in a temporary home, not a mock.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readSkillFile, removeSkill, writeSkill } from "./store";

const root = async (): Promise<string> => mkdtemp(join(tmpdir(), "epsilon-skills-"));

const input = { description: "A probe", body: "Do it.", modelInvocation: true };

describe("user skills", () => {
	test("writes, reads and removes a skill inside the skills root", async () => {
		const dir = await root();
		await writeSkill(dir, "probe", input);

		const file = await readSkillFile(dir, "home", "probe");
		expect(file?.description).toBe("A probe");
		expect(file?.body).toBe("Do it.");
		expect(file?.modelInvocation).toBe(true);
		expect(await readFile(join(dir, "probe", "SKILL.md"), "utf8")).toContain("name: probe");

		await removeSkill(dir, "probe");
		expect(await readSkillFile(dir, "home", "probe")).toBeUndefined();
	});

	test("refuses a name that would leave the skills root", async () => {
		const dir = await root();
		const outside = join(dir, "..", `${join(dir).split("/").pop()}-outside`);
		await mkdir(outside, { recursive: true });
		await writeFile(join(outside, "SKILL.md"), "---\ndescription: outside\n---\n\nbody\n");

		const escape = `../${outside.split("/").pop()}`;
		await expect(readSkillFile(dir, "home", escape)).rejects.toThrow();
		await expect(removeSkill(dir, escape)).rejects.toThrow();
		// The refusal is what matters: the file outside the root is still there.
		expect(await readFile(join(outside, "SKILL.md"), "utf8")).toContain("outside");
	});

	test("keeps unknown keys and comments, and toggles disable-model-invocation", async () => {
		const dir = await root();
		await mkdir(join(dir, "kept"), { recursive: true });
		const original = [
			"---",
			"name: kept",
			"description: Old words",
			"# Claude Code reads this",
			"allowed-tools: Read Grep",
			"argument-hint: '[file]'",
			"x-team: platform",
			"---",
			"",
			"Body $ARGUMENTS",
			"",
		].join("\n");
		await writeFile(join(dir, "kept", "SKILL.md"), original);

		await writeSkill(dir, "kept", {
			description: "New words",
			body: "Body",
			modelInvocation: false,
		});
		const text = await readFile(join(dir, "kept", "SKILL.md"), "utf8");
		expect(text).toContain("# Claude Code reads this");
		expect(text).toContain("allowed-tools: Read Grep");
		expect(text).toContain("x-team: platform");
		expect(text).toContain("description: New words");
		expect(text).toContain("disable-model-invocation: true");

		const file = await readSkillFile(dir, "home", "kept");
		expect(file?.modelInvocation).toBe(false);
		expect(file?.fields.map((field) => [field.key, field.owner])).toEqual([
			["allowed-tools", "spec"],
			["argument-hint", "claude-code"],
			["x-team", "unknown"],
		]);

		await writeSkill(dir, "kept", {
			description: "New words",
			body: "Body",
			modelInvocation: true,
		});
		expect(await readFile(join(dir, "kept", "SKILL.md"), "utf8")).not.toContain(
			"disable-model-invocation",
		);
	});

	test("reports foreign body syntax and sets or clears optional fields", async () => {
		const dir = await root();
		await writeSkill(dir, "fields", {
			...input,
			body: "Run !`ls` with $ARGUMENTS",
			license: "MIT",
			metadata: { owner: "me" },
		});
		let file = await readSkillFile(dir, "home", "fields");
		expect(file?.license).toBe("MIT");
		expect(file?.metadata).toEqual({ owner: "me" });
		expect(file?.bodyWarnings).toEqual(["$ARGUMENTS", "!`command`"]);

		// Omitted fields stay; empty ones are removed.
		await writeSkill(dir, "fields", { ...input, license: "" });
		file = await readSkillFile(dir, "home", "fields");
		expect(file?.license).toBeUndefined();
		expect(file?.metadata).toEqual({ owner: "me" });
	});

	test("returns raw text for an unparsable file and refuses to rewrite it", async () => {
		const dir = await root();
		await mkdir(join(dir, "broken"), { recursive: true });
		const broken = "---\ndescription: [unclosed\n---\n\nBody\n";
		await writeFile(join(dir, "broken", "SKILL.md"), broken);

		const file = await readSkillFile(dir, "home", "broken");
		expect(file?.parseError).toContain("not valid YAML");
		expect(file?.raw).toBe(broken);
		await expect(writeSkill(dir, "broken", input)).rejects.toThrow("was not changed");
		expect(await readFile(join(dir, "broken", "SKILL.md"), "utf8")).toBe(broken);
	});
});
