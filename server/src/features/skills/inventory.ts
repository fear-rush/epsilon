/**
 * The skills the agent sees, asked of pi and not rebuilt. pi's package manager
 * lists every skill file with its enabled flag and origin; pi's loader parses each
 * file and reports collisions and warnings. This module only labels the answer.
 *
 * A skill pi refused (no description, bad YAML) still has a `SKILL.md` the
 * manager lists, so it appears here as `invalid` with pi's own message.
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { foreignBodySyntax, skillFieldOwner } from "shared";

import { projectAgentsSkillsDir, projectSkillsDir } from "../../platform/agent-home";
import type { AgentHome } from "../../platform/agent-home";
import { loadSkillFiles, resolveSkillResources } from "../../platform/pi";
import type { ResolvedResource, ResourceDiagnostic, Skill } from "../../platform/pi";
import type { SkillOrigin, SkillRoot, SkillView } from "./contract";
import { textField } from "./fields";
import { parseSkillFile } from "./frontmatter";

/** The editable root a `SKILL.md` sits directly under, if any. */
const rootOf = (
	filePath: string,
	home: AgentHome,
	project: string | null,
): SkillRoot | undefined => {
	if (basename(filePath) !== "SKILL.md") return undefined;
	const parent = dirname(dirname(filePath));
	if (parent === resolve(home.skillsDir)) return "home";
	if (home.userAgentsSkillsDir !== undefined && parent === resolve(home.userAgentsSkillsDir)) {
		return "user-agents";
	}
	if (project === null) return undefined;
	if (parent === resolve(projectSkillsDir(project))) return "project-pi";
	if (parent === resolve(projectAgentsSkillsDir(project))) return "project-agents";
	return undefined;
};

/** Where pi found the skill, from its metadata and path. */
const originOf = (
	resource: ResolvedResource,
	home: AgentHome,
	project: string | null,
): SkillOrigin => {
	const { metadata, path } = resource;
	if (metadata.origin === "package") return "package";
	if (metadata.source === "local") return "settings-path";
	if (metadata.scope === "user") {
		return path.startsWith(`${resolve(home.skillsDir)}${sep}`) ? "home" : "user-agents";
	}
	return project !== null && path.startsWith(`${resolve(projectSkillsDir(project))}${sep}`)
		? "project-pi"
		: "project-agents";
};

/** What the file says that pi ignores or treats as text: Claude Code fields, `$ARGUMENTS`. */
const fileWarnings = async (filePath: string): Promise<string[]> => {
	let text: string;
	try {
		text = await readFile(filePath, "utf8");
	} catch {
		return [];
	}
	const parsed = parseSkillFile(text);
	if (!parsed.ok) return [];
	const warnings: string[] = [];
	const { fields, body } = parsed.file;
	const folder = basename(dirname(filePath));
	const declared = textField.safeParse(fields.name).data;
	if (declared !== undefined && declared !== folder) {
		warnings.push(`The name "${declared}" differs from the folder "${folder}"`);
	}
	const foreign = Object.keys(fields).filter((key) => skillFieldOwner(key) === "claude-code");
	if (foreign.length > 0)
		warnings.push(`pi ignores these Claude Code fields: ${foreign.join(", ")}`);
	const syntax = foreignBodySyntax(body);
	if (syntax.length > 0)
		warnings.push(`The body uses ${syntax.join(" and ")}, which pi passes through as text`);
	return warnings;
};

const messagesAt = (diagnostics: ResourceDiagnostic[], filePath: string): string[] =>
	diagnostics
		.filter((entry) => entry.type !== "collision" && entry.path === filePath)
		.map((entry) => entry.message);

/**
 * Every skill pi knows for `folder` (the chats folder for the home alone, or a
 * trusted project), in pi's precedence order, then by name. `project` is the
 * project folder, or null when the home stands alone.
 */
export const listSkills = async (
	folder: string,
	home: AgentHome,
	project: string | null,
): Promise<SkillView[]> => {
	const resources = await resolveSkillResources(folder, home);
	const loaded = loadSkillFiles(
		folder,
		home,
		resources.filter((resource) => resource.enabled).map((resource) => resource.path),
	);
	const winners = new Map<string, Skill>(loaded.skills.map((skill) => [skill.filePath, skill]));
	const losers = new Map<string, string>();
	for (const entry of loaded.diagnostics) {
		if (entry.type === "collision" && entry.collision !== undefined) {
			losers.set(entry.collision.loserPath, entry.collision.winnerPath);
		}
	}

	const views = await Promise.all(
		resources.map(async (resource): Promise<SkillView | undefined> => {
			const filePath = resource.path;
			const winner = winners.get(filePath);
			const own = winner === undefined ? loadSkillFiles(folder, home, [filePath]) : undefined;
			const skill = winner ?? own?.skills[0];
			const diagnostics = own?.diagnostics ?? loaded.diagnostics;
			const messages = messagesAt(diagnostics, filePath);
			// A markdown file with no description is no skill, and pi says nothing about it.
			if (skill === undefined && messages.length === 0 && basename(filePath) !== "SKILL.md") {
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
			const root = rootOf(filePath, home, project);
			const origin = originOf(resource, home, project);
			const status: SkillView["status"] = !resource.enabled
				? "disabled"
				: shadowedBy !== undefined
					? "shadowed"
					: skill === undefined
						? "invalid"
						: skill.disableModelInvocation
							? "manual"
							: "active";
			return {
				name: skill?.name ?? basename(dirname(filePath)),
				description: skill?.description ?? "",
				filePath,
				dir: dirname(filePath),
				origin,
				packageSource: origin === "package" ? resource.metadata.source : undefined,
				scope: resource.metadata.scope === "project" ? "project" : "user",
				editable: root !== undefined,
				root,
				modelInvocation: skill === undefined || !skill.disableModelInvocation,
				status,
				shadowedBy,
				message:
					status === "invalid" ? messages.join("; ") || "pi could not load this file" : undefined,
				toggle: origin === "package" ? "package" : "settings",
				warnings: [...(status === "invalid" ? [] : messages), ...(await fileWarnings(filePath))],
			};
		}),
	);
	return views
		.filter((view): view is SkillView => view !== undefined)
		.sort((left, right) => left.name.localeCompare(right.name));
};

/**
 * What an untrusted project holds in its skill folders. pi loads none of it
 * until the folder is trusted, so these are listed from the files and never run.
 */
export const untrustedSkills = async (project: string): Promise<SkillView[]> => {
	const roots: [string, SkillOrigin][] = [
		[projectSkillsDir(project), "project-pi"],
		[projectAgentsSkillsDir(project), "project-agents"],
	];
	const found = await Promise.all(
		roots.map(async ([dir, origin]): Promise<SkillView[]> => {
			const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
			const views = await Promise.all(
				entries
					.filter((entry) => entry.isDirectory())
					.map(async (entry): Promise<SkillView | undefined> => {
						const filePath = join(dir, entry.name, "SKILL.md");
						const text = await readFile(filePath, "utf8").catch(() => undefined);
						if (text === undefined) return undefined;
						const parsed = parseSkillFile(text);
						const description = parsed.ok
							? textField.safeParse(parsed.file.fields.description).data
							: undefined;
						return {
							name: entry.name,
							description: description ?? "",
							filePath,
							dir: join(dir, entry.name),
							origin,
							scope: "project",
							editable: false,
							modelInvocation: true,
							status: "untrusted",
							toggle: "none",
							warnings: [],
						};
					}),
			);
			return views.filter((view): view is SkillView => view !== undefined);
		}),
	);
	return found.flat();
};
