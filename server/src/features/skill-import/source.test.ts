import { describe, expect, test } from "bun:test";

import { githubRepoOf, parseImportInput } from "./source";

describe("parseImportInput", () => {
	const accepted: [string, string, string[]][] = [
		["npx skills add vercel-labs/agent-skills", "vercel-labs/agent-skills", []],
		["npx -y skills@latest add vercel-labs/agent-skills", "vercel-labs/agent-skills", []],
		["bunx skills add owner/repo --skill foo", "owner/repo", ["foo"]],
		["pnpm dlx skills add owner/repo -s foo bar", "owner/repo", ["foo", "bar"]],
		["yarn dlx skills add owner/repo --skill=foo", "owner/repo", ["foo"]],
		["skills add owner/repo -s 'foo' -s \"bar\"", "owner/repo", ["foo", "bar"]],
		["npx skills add owner/repo -s '*'", "owner/repo", []],
		["$ npx skills add owner/repo -g -a claude-code codex -y --copy --all", "owner/repo", []],
		["owner/repo", "owner/repo", []],
		["https://github.com/owner/repo", "https://github.com/owner/repo", []],
		[
			"npx skills add https://github.com/owner/repo/tree/main/skills/foo",
			"https://github.com/owner/repo/tree/main/skills/foo",
			[],
		],
		["https://gitlab.com/group/repo", "https://gitlab.com/group/repo", []],
		["git@github.com:owner/repo.git", "git@github.com:owner/repo.git", []],
		["npx add-skill owner/repo", "owner/repo", []],
	];
	for (const [input, source, skills] of accepted) {
		test(input, () => {
			expect(parseImportInput(input)).toEqual({ source, skills });
		});
	}

	const refused: [string, RegExp][] = [
		["", /Paste an install command/],
		["npx skills remove foo", /different command/],
		["npx skills list", /different command/],
		["npx skills add", /no source/],
		["npx skills add owner/repo --evil", /does not support the --evil/],
		["npx skills add ./local-folder", /folder on this computer/],
		["npx skills add /etc", /folder on this computer/],
		["npx skills add not-a-source", /is not a GitHub/],
		["npx skills add owner/repo -s 'a;b'", /is not a skill name/],
		["npx skills add a/b c/d", /one source/],
		["npx skills add 'owner/repo", /unclosed quote/],
		["npx skills add owner/repo\nrm -rf /", /single command/],
	];
	for (const [input, message] of refused) {
		test(`refuses ${JSON.stringify(input)}`, () => {
			expect(() => parseImportInput(input)).toThrow(message);
		});
	}
});

describe("githubRepoOf", () => {
	test("reads the common GitHub spellings", () => {
		expect(githubRepoOf("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
		expect(githubRepoOf("github:owner/repo")).toEqual({ owner: "owner", repo: "repo" });
		expect(githubRepoOf("https://github.com/owner/repo.git")).toEqual({
			owner: "owner",
			repo: "repo",
		});
		expect(githubRepoOf("https://github.com/owner/repo/tree/v2/skills/x")).toEqual({
			owner: "owner",
			repo: "repo",
			ref: "v2",
		});
		expect(githubRepoOf("git@github.com:owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
	});
	test("returns nothing for other hosts", () => {
		expect(githubRepoOf("https://gitlab.com/group/repo")).toBeUndefined();
		expect(githubRepoOf("gitlab:group/repo")).toBeUndefined();
	});
});
