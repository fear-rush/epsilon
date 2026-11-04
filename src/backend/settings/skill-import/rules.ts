import type { SkillImportCandidate, SkillImportIssue } from "#protocol/settings/skill-import";

import { discoverSkillDirs, relativeLinkTargets } from "../../../domain/skills/import.ts";
import {
	IMPORT_MAX_FILES,
	IMPORT_MAX_SKILL_BYTES,
	SKILL_BODY_ADVISED_LINES,
	foreignBodySyntax,
	isSkillName,
	misnamedSkillFiles,
	skillDescriptionProblem,
	skillFieldOwner,
	skillPathProblem,
} from "../../../domain/skills/rules.ts";
import { parseSkillFile, textField } from "../skills/frontmatter.ts";

/**
 * Pure rules of the import: which folders of a staged source are skills, and whether
 * each one is fit to install. Mirrors the `skills` CLI's discovery so a source finds the
 * same skills here as in a terminal. The checks follow pi's load rules, with one
 * exception: pi loads a skill with a bad name and only warns, and a permanent install
 * should not create one.
 */

/** A file of a staged source, as the checks need to see it. */
export type TreeFile = {
	/** Relative to the staged source, with `/` between folders. */
	readonly path: string;
	readonly size: number;
	readonly executable: boolean;
	readonly shebang: boolean;
};

/** What the checks need besides the files: the text of `SKILL.md` and what is installed. */
export type CandidateInput = {
	/** The skill folder relative to the staged source. */
	readonly dir: string;
	/** The skill's files, relative to the skill folder. */
	readonly files: ReadonlyArray<TreeFile>;
	/** The paths that are links, relative to the skill folder. */
	readonly links: ReadonlyArray<string>;
	/** The text of the exact `SKILL.md`, when there is one. */
	readonly skillFile: string | undefined;
	/** The paths dropped from this skill while unpacking, relative to the skill folder. */
	readonly removed: ReadonlyArray<string>;
	readonly existing: SkillImportCandidate["existing"];
};

const issue = (code: string, message: string, path?: string): SkillImportIssue =>
	path === undefined ? { code, message } : { code, message, path };

/** True for a file that can run: under `scripts/`, with a shebang, or with the execute bit. */
const runs = (file: TreeFile): boolean =>
	file.path.startsWith("scripts/") || file.shebang || file.executable;

/** The path issues and limits one skill folder must stay within. */
const limitIssues = (files: ReadonlyArray<TreeFile>): ReadonlyArray<SkillImportIssue> => {
	const found: SkillImportIssue[] = [];
	if (files.length > IMPORT_MAX_FILES) {
		found.push(
			issue(
				"too-many-files",
				`The skill has ${files.length} files; the limit is ${IMPORT_MAX_FILES}`,
			),
		);
	}
	const bytes = files.reduce((sum, file) => sum + file.size, 0);
	if (bytes > IMPORT_MAX_SKILL_BYTES) {
		found.push(
			issue(
				"too-large",
				`The skill unpacks to ${Math.ceil(bytes / 1024 / 1024)} MB; the limit is ${IMPORT_MAX_SKILL_BYTES / 1024 / 1024} MB`,
			),
		);
	}
	return found;
};

/** Checks one skill folder strictly and says what it holds. */
export const inspectCandidate = (input: CandidateInput): SkillImportCandidate => {
	const { dir, files, links, skillFile, removed, existing } = input;
	const errors: SkillImportIssue[] = [];
	const warnings: SkillImportIssue[] = [];
	const folder = dir === "" ? undefined : (dir.split("/").at(-1) ?? dir);
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
		if (parsed.ok) {
			const { fields, body } = parsed.file;
			// pi falls back to the folder name, and accepts a name that differs from it.
			const declared = textField(fields["name"]);
			if (declared !== undefined && declared !== "") {
				name = declared;
				const nameProblem = isSkillName(name)
					? undefined
					: `The name "${name}" must use lowercase letters, digits and single dashes`;
				if (nameProblem !== undefined) {
					errors.push(issue("name-invalid", nameProblem, "SKILL.md"));
				}
				if (/anthropic|claude/i.test(name)) {
					warnings.push(
						issue(
							"name-reserved",
							`"${name}" contains anthropic or claude; that matters only if the skill is uploaded to Claude`,
						),
					);
				}
			}
			const described = textField(fields["description"]);
			const problem = skillDescriptionProblem(described ?? "");
			if (problem === undefined) description = (described ?? "").trim();
			else {
				errors.push(
					issue(
						"description",
						described === undefined
							? "The frontmatter has no description"
							: `The description: ${problem}`,
						"SKILL.md",
					),
				);
				description = described ?? "";
			}
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
		} else {
			errors.push(issue("frontmatter", parsed.error, "SKILL.md"));
		}
	}

	for (const path of links) {
		errors.push(issue("symlink", `${path} is a symbolic link; links are not imported`, path));
	}
	for (const file of files) {
		const problem = skillPathProblem(file.path);
		if (problem !== undefined) errors.push(issue("unsafe-path", problem, file.path));
	}
	errors.push(...limitIssues(files));

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
export const flagDuplicateNames = (
	candidates: ReadonlyArray<SkillImportCandidate>,
): ReadonlyArray<SkillImportCandidate> => {
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

export { discoverSkillDirs };
