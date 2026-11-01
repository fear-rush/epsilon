import { isStrippedPath, skillPathProblem } from "shared";

import type { SkillBundleList } from "@/api/types";
import type { CodeEditorLanguage } from "@/components/editor/code-editor/code-editor";

/** Pure helpers of the files card: the file list, sizes, and the new-path check. */

export type BundleEntry = SkillBundleList["files"][number];

export const formatSize = (bytes: number): string =>
	bytes < 1024
		? `${bytes} B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(1)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Why a new file cannot be created at `path`, or undefined when it can. */
export const newFileProblem = (path: string, existing: ReadonlySet<string>): string | undefined => {
	if (path === "") return "Type a path, such as references/notes.md.";
	const problem = skillPathProblem(path);
	if (problem !== undefined) return problem;
	if (isStrippedPath(path)) return `${path} is never installed, so it cannot be added here.`;
	if (path.toLowerCase() === "skill.md") return "SKILL.md is edited in the form above.";
	if (existing.has(path)) return `${path} already exists.`;
	return undefined;
};

/** Why a new folder cannot be created at `path`, or undefined when it can. */
export const newFolderProblem = (
	path: string,
	files: ReadonlySet<string>,
	folders: ReadonlySet<string>,
): string | undefined => {
	if (path === "") return "Type a folder path, such as references.";
	const problem = skillPathProblem(path);
	if (problem !== undefined) return problem;
	if (isStrippedPath(path)) return `${path} is never installed, so it cannot be added here.`;
	if (path.toLowerCase() === "skill.md") return "SKILL.md is the skill's own file.";
	if (folders.has(path)) return `${path} already exists.`;
	if (files.has(path)) return `${path} is a file.`;
	return undefined;
};

export const languageOf = (path: string): CodeEditorLanguage => {
	if (/\.(md|markdown)$/i.test(path)) return "markdown";
	return /\.json$/i.test(path) ? "json" : "text";
};
