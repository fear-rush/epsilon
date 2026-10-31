import { describe, expect, test } from "bun:test";

import type { Candidate } from "./contract";
import {
	discoverSkillDirs,
	flagDuplicateNames,
	inspectCandidate,
	relativeLinkTargets,
} from "./domain";
import type { CandidateInput, TreeFile } from "./domain";

describe("discoverSkillDirs", () => {
	test("a SKILL.md at the root makes the source the one skill", () => {
		expect(discoverSkillDirs(["SKILL.md", "scripts/run.sh", "skills/other/SKILL.md"])).toEqual([
			"",
		]);
	});
	test("finds skills under skills/ and its curated folders", () => {
		expect(
			discoverSkillDirs([
				"skills/a/SKILL.md",
				"skills/.curated/b/SKILL.md",
				"skills/.system/c/SKILL.md",
				"docs/d/SKILL.md",
			]),
		).toEqual(["skills/.curated/b", "skills/.system/c", "skills/a"]);
	});
	test("finds nested skills in .claude/skills and .agents/skills", () => {
		expect(
			discoverSkillDirs([".claude/skills/group/x/SKILL.md", ".agents/skills/y/SKILL.md"]),
		).toEqual([".agents/skills/y", ".claude/skills/group/x"]);
	});
	test("falls back to a recursive search, skipping .git and node_modules", () => {
		expect(
			discoverSkillDirs(["deep/er/thing/SKILL.md", "node_modules/pkg/SKILL.md", ".git/x/SKILL.md"]),
		).toEqual(["deep/er/thing"]);
	});
	test("a skill inside another skill is part of it", () => {
		expect(discoverSkillDirs(["skills/a/SKILL.md", "skills/a/examples/b/SKILL.md"])).toEqual([
			"skills/a",
		]);
	});
	test("a wrongly cased skill.md is still found, so it can be explained", () => {
		expect(discoverSkillDirs(["skills/a/skill.md"])).toEqual(["skills/a"]);
	});
	test("nothing found is an empty list", () => {
		expect(discoverSkillDirs(["README.md"])).toEqual([]);
	});
});

const file = (path: string, extra: Partial<TreeFile> = {}): TreeFile => ({
	path,
	size: 10,
	executable: false,
	shebang: false,
	...extra,
});

const good = "---\nname: probe\ndescription: Probes things\n---\n\nDo the probe.\n";

const input = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
	dir: "skills/probe",
	files: [file("SKILL.md")],
	links: [],
	skillFile: good,
	removed: [],
	existing: { global: false, project: false },
	...overrides,
});

const codes = (issues: Candidate["errors"]) => issues.map((item) => item.code);

describe("inspectCandidate errors", () => {
	test("a valid skill has none", () => {
		const result = inspectCandidate(input());
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.name).toBe("probe");
		expect(result.description).toBe("Probes things");
		expect(result.modelInvocation).toBe(true);
	});
	test("skill.md must be renamed", () => {
		const result = inspectCandidate(input({ files: [file("skill.md")], skillFile: undefined }));
		expect(codes(result.errors)).toEqual(["skill-file-name"]);
		expect(result.errors[0]?.message).toContain("renamed to SKILL.md");
	});
	test("no SKILL.md at all", () => {
		expect(codes(inspectCandidate(input({ files: [], skillFile: undefined })).errors)).toEqual([
			"no-skill-file",
		]);
	});
	test("frontmatter must open on line 1", () => {
		const result = inspectCandidate(input({ skillFile: `\n${good}` }));
		expect(codes(result.errors)).toEqual(["frontmatter"]);
	});
	test("frontmatter must be valid YAML", () => {
		const result = inspectCandidate(input({ skillFile: "---\nname: [oops\n---\nBody\n" }));
		expect(codes(result.errors)).toEqual(["frontmatter"]);
	});
	test("name is required", () => {
		const result = inspectCandidate(input({ skillFile: "---\ndescription: d\n---\nBody\n" }));
		expect(codes(result.errors)).toEqual(["name-missing"]);
	});
	test("name must follow pi's rule", () => {
		const result = inspectCandidate(
			input({
				dir: "skills/Bad_Name",
				skillFile: "---\nname: Bad_Name\ndescription: d\n---\nBody\n",
			}),
		);
		expect(codes(result.errors)).toEqual(["name-invalid"]);
	});
	test("name must equal the folder name", () => {
		const result = inspectCandidate(input({ dir: "skills/other" }));
		expect(codes(result.errors)).toEqual(["name-folder"]);
	});
	test("a root-level skill has no folder name to match", () => {
		expect(inspectCandidate(input({ dir: "" })).errors).toEqual([]);
	});
	test("description is required and limited", () => {
		const missing = inspectCandidate(input({ skillFile: "---\nname: probe\n---\nBody\n" }));
		expect(codes(missing.errors)).toEqual(["description"]);
		const tags = inspectCandidate(
			input({ skillFile: "---\nname: probe\ndescription: use <b>this</b>\n---\nBody\n" }),
		);
		expect(codes(tags.errors)).toEqual(["description"]);
		const long = inspectCandidate(
			input({ skillFile: `---\nname: probe\ndescription: ${"x".repeat(1100)}\n---\nBody\n` }),
		);
		expect(codes(long.errors)).toEqual(["description"]);
	});
	test("the body must not be empty", () => {
		const result = inspectCandidate(
			input({ skillFile: "---\nname: probe\ndescription: d\n---\n\n  \n" }),
		);
		expect(codes(result.errors)).toEqual(["body-empty"]);
	});
	test("links are refused", () => {
		const result = inspectCandidate(input({ links: ["ref/passwd"] }));
		expect(codes(result.errors)).toEqual(["symlink"]);
	});
	test("unsafe paths are refused", () => {
		const result = inspectCandidate(input({ files: [file("SKILL.md"), file("../escape.txt")] }));
		expect(codes(result.errors)).toEqual(["unsafe-path"]);
	});
	test("file count and size limits", () => {
		const many = Array.from({ length: 501 }, (_, index) => file(`f${index}.txt`, { size: 1 }));
		expect(codes(inspectCandidate(input({ files: [file("SKILL.md"), ...many] })).errors)).toEqual([
			"too-many-files",
		]);
		const big = file("big.bin", { size: 26 * 1024 * 1024 });
		expect(codes(inspectCandidate(input({ files: [file("SKILL.md"), big] })).errors)).toEqual([
			"too-large",
		]);
	});
	test("duplicate names in one source", () => {
		const one = inspectCandidate(input());
		const two = inspectCandidate(input({ dir: "other/probe" }));
		const flagged = flagDuplicateNames([one, two]);
		expect(codes(flagged[0]?.errors ?? [])).toEqual([]);
		expect(codes(flagged[1]?.errors ?? [])).toEqual(["name-duplicate"]);
	});
});

describe("inspectCandidate warnings", () => {
	const warned = (overrides: Partial<CandidateInput>) =>
		codes(inspectCandidate(input(overrides)).warnings);

	test("an existing skill of the same name", () => {
		expect(warned({ existing: { global: true, project: false } })).toEqual(["already-installed"]);
	});
	test("a long SKILL.md", () => {
		const body = Array.from({ length: 520 }, () => "line").join("\n");
		expect(warned({ skillFile: `---\nname: probe\ndescription: d\n---\n${body}\n` })).toEqual([
			"long-body",
		]);
	});
	test("relative links to files outside the bundle", () => {
		const text =
			"---\nname: probe\ndescription: d\n---\nSee [a](ref/a.md), [b](https://x.dev), [c](#top), [d](ref/d.md#x).\n";
		const result = inspectCandidate(
			input({ skillFile: text, files: [file("SKILL.md"), file("ref/d.md")] }),
		);
		expect(result.warnings.map((item) => item.path)).toEqual(["ref/a.md"]);
	});
	test("scripts by folder, shebang and execute bit", () => {
		const result = inspectCandidate(
			input({
				files: [
					file("SKILL.md"),
					file("scripts/a.py"),
					file("tools/b", { shebang: true }),
					file("c.sh", { executable: true }),
					file("notes.md"),
				],
			}),
		);
		expect(result.scripts).toEqual(["scripts/a.py", "tools/b", "c.sh"]);
		expect(codes(result.warnings)).toEqual(["scripts"]);
	});
	test("fields pi ignores", () => {
		const text =
			"---\nname: probe\ndescription: d\nmodel: opus\nlicense: MIT\nweird: 1\n---\nBody\n";
		const result = inspectCandidate(input({ skillFile: text }));
		expect(result.warnings.map((item) => item.message)).toEqual([
			"pi ignores model",
			"pi ignores weird",
		]);
	});
	test("another agent's body syntax", () => {
		expect(
			warned({ skillFile: "---\nname: probe\ndescription: d\n---\nRun $ARGUMENTS and !`ls`\n" }),
		).toEqual(["foreign-syntax", "foreign-syntax"]);
	});
	test("anthropic or claude in the name", () => {
		const text = "---\nname: claude-helper\ndescription: d\n---\nBody\n";
		const result = inspectCandidate(input({ dir: "skills/claude-helper", skillFile: text }));
		expect(codes(result.warnings)).toEqual(["name-reserved"]);
	});
	test("disable-model-invocation is reported", () => {
		const text = "---\nname: probe\ndescription: d\ndisable-model-invocation: true\n---\nBody\n";
		expect(inspectCandidate(input({ skillFile: text })).modelInvocation).toBe(false);
	});
});

test("relativeLinkTargets ignores code fences and resolves dots", () => {
	expect(
		relativeLinkTargets("[a](./x/../y.md)\n```\n[b](nope.md)\n```\n[c](mailto:a@b.c) [d](/abs)"),
	).toEqual(["y.md"]);
});
