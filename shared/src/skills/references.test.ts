import { describe, expect, test } from "bun:test";

import { linkSkillReferences, skillLinkName, skillReferences, usesSkillTool } from "./references";

const names = (body: string) => skillReferences(body).map((ref) => [ref.name, ref.kind]);
const all = () => true;

describe("skillReferences", () => {
	test("finds /skill: commands", () => {
		expect(names("Run /skill:deploy-app then /skill:lint.")).toEqual([
			["deploy-app", "command"],
			["lint", "command"],
		]);
	});

	test("ignores paths and other words that look like it", () => {
		expect(names("see docs/skill:x and /skill: and /skills/foo")).toEqual([]);
	});

	test("finds Skill(name) and Skill tool sentences", () => {
		expect(names('Call Skill(review) or Skill( "ship-it" ).')).toEqual([
			["review", "claude-code"],
			["ship-it", "claude-code"],
		]);
		expect(names('Use the Skill tool with "pdf" to read it.')).toEqual([["pdf", "claude-code"]]);
		expect(names("Skill tool, skill: `docx`")).toEqual([["docx", "claude-code"]]);
	});

	test("reports offsets of the name alone", () => {
		const body = "go /skill:abc now";
		const [ref] = skillReferences(body);
		expect(body.slice(ref?.from, ref?.to)).toBe("abc");
	});
});

describe("usesSkillTool", () => {
	test("is true for the Skill tool and Skill( calls only", () => {
		expect(usesSkillTool("Invoke the Skill tool first")).toBe(true);
		expect(usesSkillTool("Skill(foo)")).toBe(true);
		expect(usesSkillTool("A skill tooling guide, /skill:x")).toBe(false);
	});
});

describe("linkSkillReferences", () => {
	test("links a name in prose", () => {
		expect(linkSkillReferences("Run /skill:deploy now", all)).toBe(
			"Run /skill:[deploy](#skill:deploy) now",
		);
		expect(linkSkillReferences('Skill tool with "pdf"', all)).toBe(
			'Skill tool with "[pdf](#skill:pdf)"',
		);
	});

	test("wraps an inline code span once", () => {
		expect(linkSkillReferences("Use `/skill:deploy`.", all)).toBe(
			"Use [`/skill:deploy`](#skill:deploy).",
		);
	});

	test("skips fenced code and skills that do not exist", () => {
		const fenced = "```\n/skill:deploy\n```";
		expect(linkSkillReferences(fenced, all)).toBe(fenced);
		expect(linkSkillReferences("/skill:ghost", (name) => name === "real")).toBe("/skill:ghost");
	});

	test("reads the name back from the href", () => {
		expect(skillLinkName("#skill:deploy")).toBe("deploy");
		expect(skillLinkName("#intro")).toBeUndefined();
	});
});
