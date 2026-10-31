/**
 * Pure rules of the import: which folders of a staged source are skills, and
 * whether each one is fit to install. Mirrors the `skills` CLI's discovery so a
 * source finds the same skills here as in a terminal; the checks are Epsilon's,
 * stricter than pi's own, because pi warns and loads while a write is permanent.
 */
import {
	SKILL_BODY_ADVISED_LINES,
	foreignBodySyntax,
	misnamedSkillFiles,
	skillDescriptionSchema,
	skillFieldOwner,
	skillLimitIssues,
	skillNameSchema,
	skillPathProblem,
} from "shared";
import type { SkillIssue } from "shared";
import { z } from "zod";

import { parseSkillFile } from "../skills";
import type { Candidate } from "./contract";

/** A file of a staged source, as the checks need to see it. */
export type TreeFile = {
	/** Relative to the staged source, with `/` between folders. */
	path: string;
	size: number;
	executable: boolean;
	shebang: boolean;
};

/** Where the `skills` CLI looks before it searches everything, in its order. */
const SEARCH_DIRS = [
	"skills",
	"skills/.curated",
	"skills/.experimental",
	"skills/.system",
	".agents/skills",
	".claude/skills",
];
const SEARCH_DEPTH = 3;

const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const depthOf = (dir: string): number => (dir === "" ? 0 : dir.split("/").length);

const isSkillFileName = (name: string): boolean => name.toLowerCase() === "skill.md";

/** Drops every folder that sits inside another skill: a skill is not searched for skills. */
const outermost = (dirs: string[]): string[] =>
	dirs.filter((dir) => !dirs.some((other) => other !== dir && dir.startsWith(`${other}/`)));

/**
 * The skill folders in a staged source, relative to it. A `SKILL.md` at the root
 * makes the source itself the one skill. Otherwise the CLI's usual places are
 * searched three levels deep, and only when they hold nothing is the whole tree.
 * A file named `skill.md` counts, so validation can say how to rename it.
 */
export const discoverSkillDirs = (paths: readonly string[]): string[] => {
	const dirs = new Set(
		paths
			.filter((path) => isSkillFileName(nameOf(path)))
			.filter((path) => !path.split("/").some((part) => part === ".git" || part === "node_modules"))
			.map(dirOf),
	);
	if (dirs.has("")) return [""];
	const preferred = new Set<string>();
	for (const search of SEARCH_DIRS) {
		for (const dir of dirs) {
			if (dir.startsWith(`${search}/`) && depthOf(dir) - depthOf(search) <= SEARCH_DEPTH) {
				preferred.add(dir);
			}
		}
	}
	return outermost([...(preferred.size > 0 ? preferred : dirs)]).sort();
};

const FENCE = /^(```|~~~)[\s\S]*?^\1[ \t]*$/gm;
const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Relative file targets of the markdown links in a body, resolved against the skill folder. */
export const relativeLinkTargets = (body: string): string[] => {
	const targets: string[] = [];
	for (const match of body.replace(FENCE, "").matchAll(LINK)) {
		const raw = match[1] ?? "";
		if (raw.startsWith("#") || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
		let target = raw.replace(/[?#].*$/, "");
		try {
			target = decodeURIComponent(target);
		} catch {
			// A malformed escape stays as typed; the file check then reports it missing.
		}
		const stack: string[] = [];
		for (const part of target.split("/")) {
			if (part === "" || part === ".") continue;
			if (part === "..") stack.pop();
			else stack.push(part);
		}
		if (stack.length > 0) targets.push(stack.join("/"));
	}
	return [...new Set(targets)];
};

/** What the checks need besides the files: the text of `SKILL.md` and what is already installed. */
export type CandidateInput = {
	/** The skill folder relative to the staged source. */
	dir: string;
	/** The skill's files, relative to the skill folder. */
	files: readonly TreeFile[];
	/** The paths that are links, relative to the skill folder. */
	links: readonly string[];
	/** The text of the exact `SKILL.md`, when there is one. */
	skillFile: string | undefined;
	/** The paths dropped from this skill while unpacking, relative to the skill folder. */
	removed: readonly string[];
	existing: Candidate["existing"];
};

const issue = (code: string, message: string, path?: string): SkillIssue =>
	path === undefined ? { code, message } : { code, message, path };

/** True for a file that can run: under `scripts/`, with a shebang, or with the execute bit. */
const runs = (file: TreeFile): boolean =>
	file.path.startsWith("scripts/") || file.shebang || file.executable;

/** Checks one skill folder strictly and says what it holds. */
export const inspectCandidate = (input: CandidateInput): Candidate => {
	const { dir, files, links, skillFile, removed, existing } = input;
	const errors: SkillIssue[] = [];
	const warnings: SkillIssue[] = [];
	const folder = dir === "" ? undefined : nameOf(dir);
	let name = folder ?? "skill";
	let description = "";
	let modelInvocation = true;

	const rootNames = files.filter((file) => !file.path.includes("/")).map((file) => file.path);
	for (const wrong of misnamedSkillFiles(rootNames)) {
		errors.push(
			issue(
				"skill-file-name",
				`${wrong} must be renamed to SKILL.md; pi only reads that exact name`,
				wrong,
			),
		);
	}
	if (skillFile === undefined) {
		if (misnamedSkillFiles(rootNames).length === 0) {
			errors.push(issue("no-skill-file", "The folder has no SKILL.md"));
		}
	} else {
		const parsed = parseSkillFile(skillFile);
		if (!parsed.ok) {
			errors.push(issue("frontmatter", parsed.error, "SKILL.md"));
		} else {
			const { fields, body } = parsed.file;
			const named = z.string().min(1).safeParse(fields.name);
			if (!named.success) {
				errors.push(issue("name-missing", "The frontmatter has no name", "SKILL.md"));
			} else {
				const rawName = named.data;
				name = rawName;
				const checked = skillNameSchema.safeParse(rawName);
				if (!checked.success) {
					errors.push(
						issue(
							"name-invalid",
							`The name "${rawName}": ${checked.error.issues[0]?.message}`,
							"SKILL.md",
						),
					);
				}
				if (folder !== undefined && rawName !== folder) {
					errors.push(
						issue(
							"name-folder",
							`The name "${rawName}" must equal the folder name "${folder}"`,
							"SKILL.md",
						),
					);
				}
				if (/anthropic|claude/i.test(rawName)) {
					warnings.push(
						issue(
							"name-reserved",
							`"${rawName}" contains anthropic or claude; that matters only if the skill is uploaded to Claude`,
						),
					);
				}
			}
			const checkedDescription = skillDescriptionSchema.safeParse(fields.description);
			if (checkedDescription.success) description = checkedDescription.data;
			else {
				const problem =
					fields.description === undefined
						? "The frontmatter has no description"
						: `The description: ${checkedDescription.error.issues[0]?.message ?? "is not text"}`;
				errors.push(issue("description", problem, "SKILL.md"));
				const text = z.string().safeParse(fields.description);
				if (text.success) description = text.data;
			}
			if (body.trim() === "")
				errors.push(
					issue("body-empty", "SKILL.md has no instructions below the frontmatter", "SKILL.md"),
				);
			if (fields["disable-model-invocation"] === true) modelInvocation = false;

			const lines = body.split("\n").length;
			if (lines > SKILL_BODY_ADVISED_LINES) {
				warnings.push(
					issue(
						"long-body",
						`SKILL.md has ${lines} lines; past ${SKILL_BODY_ADVISED_LINES}, move detail into files it links to`,
						"SKILL.md",
					),
				);
			}
			const known = new Set(files.map((file) => file.path));
			const missing = relativeLinkTargets(body).filter(
				(target) => !known.has(target) && ![...known].some((path) => path.startsWith(`${target}/`)),
			);
			for (const target of missing) {
				warnings.push(
					issue("link-missing", `SKILL.md links to ${target}, which is not in the skill`, target),
				);
			}
			for (const key of Object.keys(fields)) {
				const owner = skillFieldOwner(key);
				if (owner === "claude-code" || owner === "unknown") {
					warnings.push(issue("field-ignored", `pi ignores ${key}`, "SKILL.md"));
				}
			}
			for (const syntax of foreignBodySyntax(body)) {
				warnings.push(
					issue(
						"foreign-syntax",
						`The instructions use ${syntax}, which another agent expands and pi shows as plain text`,
						"SKILL.md",
					),
				);
			}
		}
	}

	for (const path of links) {
		errors.push(issue("symlink", `${path} is a symbolic link; links are not imported`, path));
	}
	for (const file of files) {
		const problem = skillPathProblem(file.path);
		if (problem !== undefined) errors.push(issue("unsafe-path", problem, file.path));
	}
	errors.push(...skillLimitIssues(files));

	const places = [
		existing.global ? "your global skills" : "",
		existing.project ? "the project's skills" : "",
	].filter((place) => place !== "");
	if (places.length > 0) {
		warnings.push(
			issue(
				"already-installed",
				`A skill named ${name} is already in ${places.join(" and ")}; the copy pi finds first shadows the other`,
			),
		);
	}

	const scripts = files.filter(runs).map((file) => file.path);
	if (scripts.length > 0) {
		warnings.push(
			issue(
				"scripts",
				`Includes ${scripts.length} script${scripts.length === 1 ? "" : "s"} the agent can run: ${scripts.join(", ")}`,
			),
		);
	}

	return {
		name,
		dir,
		description,
		files: files.map(({ path, size }) => ({ path, size })),
		scripts,
		errors,
		warnings,
		removed: [...removed],
		modelInvocation,
		existing,
	};
};

/** Two skills in one source cannot both be installed under the same name. */
export const flagDuplicateNames = (candidates: Candidate[]): Candidate[] => {
	const seen = new Set<string>();
	return candidates.map((candidate) => {
		if (!seen.has(candidate.name)) {
			seen.add(candidate.name);
			return candidate;
		}
		return {
			...candidate,
			errors: [
				...candidate.errors,
				issue("name-duplicate", `Another skill in this source is also named ${candidate.name}`),
			],
		};
	});
};
