import { basename, dirname, join, resolve, sep } from "node:path";

import { Effect } from "effect";
import type { FileSystem } from "effect";

import type { SkillEngineLive, SkillOrigin, SkillRoot, SkillView } from "#protocol/config/skills";
import type { SkillRefused } from "#protocol/errors";

import { withDefined } from "../../../domain/object.ts";
import {
	SKILL_FILE_NAME,
	foreignBodySyntax,
	skillFieldOwner,
} from "../../../domain/skills/rules.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import type { PiSkillsApi, ResolvedResource, Skill } from "../../platform/pi.ts";
import { parseSkillFile, textField } from "./frontmatter.ts";

/**
 * The skills the agent sees, asked of pi and not rebuilt. pi's resolver lists every skill
 * file with its enabled flag and origin; pi's loader parses each file and reports
 * collisions and warnings. This module only labels the answer.
 *
 * A skill pi refused (no description, bad YAML) still has a `SKILL.md` the manager lists,
 * so it appears here as `invalid` with pi's own message.
 */

export const homeSkillsDir = (home: AgentHomeApi): string => join(home.agentDir, "skills");
export const userAgentsSkillsDir = (home: AgentHomeApi): string =>
	join(home.userHome, ".agents", "skills");
export const projectSkillsDir = (project: string): string => join(project, ".pi", "skills");
export const projectAgentsSkillsDir = (project: string): string =>
	join(project, ".agents", "skills");

/** The editable root a `SKILL.md` sits directly under, if any. */
const rootOf = (
	filePath: string,
	home: AgentHomeApi,
	project: string | null,
): SkillRoot | undefined => {
	if (basename(filePath) !== SKILL_FILE_NAME) return undefined;
	const parent = dirname(dirname(filePath));
	if (parent === resolve(homeSkillsDir(home))) return "home";
	if (parent === resolve(userAgentsSkillsDir(home))) return "user-agents";
	if (project === null) return undefined;
	if (parent === resolve(projectSkillsDir(project))) return "project-pi";
	if (parent === resolve(projectAgentsSkillsDir(project))) return "project-agents";
	return undefined;
};

/** Where pi found the skill, from its metadata and path. */
const originOf = (
	resource: ResolvedResource,
	home: AgentHomeApi,
	project: string | null,
): SkillOrigin => {
	const { metadata, path } = resource;
	if (metadata.origin === "package") return "package";
	if (metadata.source === "local") return "settings-path";
	if (metadata.scope === "user") {
		return path.startsWith(`${resolve(homeSkillsDir(home))}${sep}`) ? "home" : "user-agents";
	}
	return project !== null && path.startsWith(`${resolve(projectSkillsDir(project))}${sep}`)
		? "project-pi"
		: "project-agents";
};

/** What the file says that pi ignores or treats as text: Claude Code fields, `$ARGUMENTS`. */
const fileWarnings = (
	fs: FileSystem.FileSystem,
	filePath: string,
): Effect.Effect<ReadonlyArray<string>> =>
	Effect.gen(function* () {
		const text = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => undefined));
		if (text === undefined) return [];
		const parsed = parseSkillFile(text);
		if (!parsed.ok) return [];
		const warnings: string[] = [];
		const folder = basename(dirname(filePath));
		const declared = textField(parsed.file.fields["name"]);
		if (declared !== undefined && declared !== folder) {
			warnings.push(`The name "${declared}" differs from the folder "${folder}"`);
		}
		const foreign = Object.keys(parsed.file.fields).filter(
			(key) => skillFieldOwner(key) === "claude-code",
		);
		if (foreign.length > 0) {
			warnings.push(`pi ignores these Claude Code fields: ${foreign.join(", ")}`);
		}
		const syntax = foreignBodySyntax(parsed.file.body);
		if (syntax.length > 0) {
			warnings.push(`The body uses ${syntax.join(" and ")}, which pi passes through as text`);
		}
		return warnings;
	});

const messagesAt = (diagnostics: ReadonlyArray<ResolvedDiagnostic>, filePath: string): string[] =>
	diagnostics
		.filter((entry) => entry.type !== "collision" && entry.path === filePath)
		.map((entry) => entry.message);

type ResolvedDiagnostic = {
	readonly type: "warning" | "error" | "collision";
	readonly message: string;
	readonly path?: string;
	readonly collision?: { readonly loserPath: string; readonly winnerPath: string };
};

/**
 * Rows for the skills a live engine's extensions added. They exist only inside that
 * engine, so a read with no engine sees the file inventory alone.
 */
const extensionViews = (
	live: ReadonlyArray<SkillEngineLive>,
	scope: SkillView["scope"],
	fs: FileSystem.FileSystem,
): Effect.Effect<ReadonlyArray<SkillView>> =>
	Effect.forEach(
		live,
		(skill) =>
			Effect.gen(function* () {
				const warnings = yield* fileWarnings(fs, skill.filePath);
				return {
					name: skill.name,
					folder: basename(skill.baseDir),
					description: skill.description,
					filePath: skill.filePath,
					dir: skill.baseDir,
					origin: "extension",
					scope,
					editable: false,
					modelInvocation: !skill.disableModelInvocation,
					status: skill.disableModelInvocation ? "manual" : "active",
					toggle: "none",
					warnings: [...warnings],
				} satisfies SkillView;
			}),
		{ concurrency: 8 },
	);

export type InventoryDeps = {
	readonly cwd: string;
	readonly home: AgentHomeApi;
	readonly project: string | null;
	readonly skills: PiSkillsApi;
	readonly fs: FileSystem.FileSystem;
	readonly live: ReadonlyArray<SkillEngineLive>;
};

/**
 * Every skill pi knows for `cwd` (the home alone for a null project), in pi's precedence
 * order, then by name, plus the extension skills a live engine reported.
 */
export const listSkills = (
	deps: InventoryDeps,
): Effect.Effect<ReadonlyArray<SkillView>, SkillRefused> =>
	Effect.gen(function* () {
		const resolved = yield* deps.skills.resolve;
		const resources = resolved.skills;
		const loaded = yield* deps.skills.load(
			resources.filter((resource) => resource.enabled).map((resource) => resource.path),
		);
		const winners = new Map<string, Skill>(loaded.skills.map((skill) => [skill.filePath, skill]));
		const losers = new Map<string, string>();
		for (const entry of loaded.diagnostics) {
			if (entry.type === "collision" && entry.collision !== undefined) {
				losers.set(entry.collision.loserPath, entry.collision.winnerPath);
			}
		}

		const views = yield* Effect.forEach(
			resources,
			(resource): Effect.Effect<SkillView | undefined> =>
				Effect.gen(function* () {
					const filePath = resource.path;
					const winner = winners.get(filePath);
					const own = winner === undefined ? yield* deps.skills.load([filePath]) : undefined;
					const skill = winner ?? own?.skills[0];
					const diagnostics: ReadonlyArray<ResolvedDiagnostic> =
						own?.diagnostics ?? loaded.diagnostics;
					const messages = messagesAt(diagnostics, filePath);
					// A markdown file with no description is no skill, and pi says nothing about it.
					if (
						skill === undefined &&
						messages.length === 0 &&
						basename(filePath) !== SKILL_FILE_NAME
					) {
						return undefined;
					}
					const shadowedBy = losers.get(filePath);
					// A file pi loaded twice through a link is the same skill, listed once.
					if (
						resource.enabled &&
						skill !== undefined &&
						winner === undefined &&
						shadowedBy === undefined
					) {
						return undefined;
					}
					const root = rootOf(filePath, deps.home, deps.project);
					const origin = originOf(resource, deps.home, deps.project);
					const folderName = basename(dirname(filePath));
					const disabled = !resource.enabled;
					const shadowed = shadowedBy !== undefined;
					let status: SkillView["status"] = "active";
					if (disabled) status = "disabled";
					else if (shadowed) status = "shadowed";
					else if (skill === undefined) status = "invalid";
					else if (skill.disableModelInvocation) status = "manual";
					const warnings = yield* fileWarnings(deps.fs, filePath);
					return withDefined(
						withDefined(
							withDefined(
								withDefined(
									{
										name: skill?.name ?? folderName,
										folder: folderName,
										description: skill?.description ?? "",
										filePath,
										dir: dirname(filePath),
										origin,
										scope: resource.metadata.scope === "project" ? "project" : "user",
										editable: root !== undefined,
										modelInvocation: skill === undefined || !skill.disableModelInvocation,
										status,
										toggle: origin === "package" ? "package" : "settings",
										warnings: [...(status === "invalid" ? [] : messages), ...warnings],
									} satisfies SkillView,
									"root",
									root,
								),
								"packageSource",
								origin === "package" ? resource.metadata.source : undefined,
							),
							"shadowedBy",
							shadowedBy,
						),
						"message",
						status === "invalid" ? messages.join("; ") || "pi could not load this file" : undefined,
					);
				}),
			{ concurrency: 8 },
		);
		const fromFiles = views.filter((view): view is SkillView => view !== undefined);
		// A file answer wins over the same file reached through an extension path, because
		// it knows the origin and the settings entry that controls it.
		const known = new Set(fromFiles.map((view) => view.filePath));
		const fromExtensions = yield* extensionViews(
			deps.live,
			deps.project === null ? "user" : "project",
			deps.fs,
		);
		return [...fromFiles, ...fromExtensions.filter((view) => !known.has(view.filePath))].toSorted(
			(left, right) => left.name.localeCompare(right.name),
		);
	});
