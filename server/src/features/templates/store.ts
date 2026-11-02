/**
 * Prompt templates and themes: the entries pi resolves, and the path list that
 * feeds prompt templates. pi picks the files and says which are enabled, so the
 * inventory is pi's own answer; a write only edits the `prompts` list in the
 * settings file that holds it, through pi's setter.
 *
 * A theme is listed, never applied or configured: it changes pi's terminal and
 * nothing in the dashboard can show the result, so the `themes` list is left to
 * `settings.json` (`docs/DECISIONS.md`, Templates).
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import {
	readTemplatePaths,
	resolveAllResources,
	writePromptTemplatePaths,
} from "../../platform/pi";
import type { SettingsScope } from "../../platform/pi";
import type { TemplateKind, TemplateList, TemplatePathInput } from "./contract";

/** The suffix pi loads for a prompt template (`FILE_PATTERNS` in its package manager). */
const PROMPT_SUFFIX = ".md";

/** Why a theme path is not written here, in the sentence the panel shows. */
const THEME_ONLY = "A theme path only changes a terminal; edit the themes paths in settings.json.";

/** The override marks pi accepts at the start of a path-list entry. */
const MARK = /^[!+-]/;

/**
 * The absolute path a settings entry names, resolved the way pi resolves it: `~`
 * against the home, a relative path against the folder of the settings file.
 */
const entryPath = (folder: string, home: AgentHome, scope: SettingsScope, raw: string): string => {
	const base = scope === "user" ? home.dir : resolve(folder, ".pi");
	const trimmed = raw.trim();
	const expanded =
		trimmed === "~"
			? homedir()
			: trimmed.startsWith("~/")
				? join(homedir(), trimmed.slice(2))
				: trimmed;
	return resolve(base, expanded);
};

/** The paths pi resolved for one kind and scope, plus the list that produced them. */
export const listTemplates = async (
	folder: string,
	home: AgentHome,
	kind: TemplateKind,
	scope: SettingsScope,
): Promise<TemplateList> => {
	const resolved = await resolveAllResources(folder, home);
	const entries = resolved[kind]
		.filter((entry) => entry.metadata.scope === scope)
		.map((entry) => ({
			path: entry.path,
			name: basename(entry.path, extname(entry.path)),
			enabled: entry.enabled,
			origin: entry.metadata.origin,
			source: entry.metadata.source,
			dir: dirname(entry.path),
		}));
	return { paths: readTemplatePaths(folder, home, scope, kind), entries };
};

/**
 * Adds one path to the scope's prompt template list. The path must exist and be a
 * folder or a `.md` file, so the list cannot gain an entry pi would skip. A theme
 * path is refused: it only changes a terminal.
 */
export const addTemplatePath = async (
	folder: string,
	home: AgentHome,
	input: TemplatePathInput,
): Promise<void> => {
	if (input.kind !== "prompts") throw new Error(THEME_ONLY);
	const path = input.path.trim();
	if (path === "") throw new Error("A path is required");
	const target = entryPath(folder, home, input.scope, path);
	if (!existsSync(target)) throw new Error(`${path} does not exist`);
	if (statSync(target).isFile() && extname(target) !== PROMPT_SUFFIX) {
		throw new Error(`A prompt template path is a folder or a ${PROMPT_SUFFIX} file`);
	}
	const paths = readTemplatePaths(folder, home, input.scope, "prompts");
	const already = paths.some(
		(entry) => entryPath(folder, home, input.scope, entry.replace(MARK, "")) === target,
	);
	if (already) throw new Error(`${path} is already in the prompt template paths`);
	await writePromptTemplatePaths(folder, home, input.scope, [...paths, path]);
};

/** Removes one entry from the scope's prompt template list, by the text the list shows. */
export const removeTemplatePath = async (
	folder: string,
	home: AgentHome,
	input: TemplatePathInput,
): Promise<void> => {
	if (input.kind !== "prompts") throw new Error(THEME_ONLY);
	const paths = readTemplatePaths(folder, home, input.scope, "prompts");
	const next = paths.filter((entry) => entry !== input.path);
	if (next.length === paths.length) {
		throw new Error("That path is not in the prompt template paths");
	}
	await writePromptTemplatePaths(folder, home, input.scope, next);
};
