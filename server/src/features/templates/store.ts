/**
 * Prompt templates and themes: the entries pi resolves, and the `prompts` and
 * `themes` path lists that feed them. pi picks the files and says which are
 * enabled, so the inventory is pi's own answer; a write only edits the list in the
 * settings file that holds it, through pi's setter.
 *
 * A theme is listed, never applied: Epsilon draws its own interface and has no
 * theme picker (`docs/DECISIONS.md`).
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { readTemplatePaths, resolveAllResources, writeTemplatePaths } from "../../platform/pi";
import type { SettingsScope } from "../../platform/pi";
import type { TemplateKind, TemplateList, TemplatePathInput } from "./contract";

/** The suffix pi loads for each kind (`FILE_PATTERNS` in pi's package manager). */
const SUFFIX: Record<TemplateKind, string> = { prompts: ".md", themes: ".json" };

/** What one kind is called in a sentence. */
const LABEL: Record<TemplateKind, string> = { prompts: "prompt template", themes: "theme" };

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
 * Adds one path to the scope's list. The path must exist and be a folder, or a
 * file of the kind pi loads, so a list cannot gain an entry pi would ignore.
 */
export const addTemplatePath = async (
	folder: string,
	home: AgentHome,
	input: TemplatePathInput,
): Promise<void> => {
	const path = input.path.trim();
	if (path === "") throw new Error("A path is required");
	const target = entryPath(folder, home, input.scope, path);
	if (!existsSync(target)) throw new Error(`${path} does not exist`);
	if (statSync(target).isFile() && extname(target) !== SUFFIX[input.kind]) {
		throw new Error(`A ${LABEL[input.kind]} path is a folder or a ${SUFFIX[input.kind]} file`);
	}
	const paths = readTemplatePaths(folder, home, input.scope, input.kind);
	const already = paths.some(
		(entry) => entryPath(folder, home, input.scope, entry.replace(MARK, "")) === target,
	);
	if (already) throw new Error(`${path} is already in the ${input.kind} paths`);
	await writeTemplatePaths(folder, home, input.scope, input.kind, [...paths, path]);
};

/** Removes one entry from the scope's list, by the exact text the list shows. */
export const removeTemplatePath = async (
	folder: string,
	home: AgentHome,
	input: TemplatePathInput,
): Promise<void> => {
	const paths = readTemplatePaths(folder, home, input.scope, input.kind);
	const next = paths.filter((entry) => entry !== input.path);
	if (next.length === paths.length) {
		throw new Error(`That path is not in the ${input.kind} paths`);
	}
	await writeTemplatePaths(folder, home, input.scope, input.kind, next);
};
