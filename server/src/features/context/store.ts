/**
 * The context a folder decides on disk, asked of pi and not rebuilt. No engine and
 * no session: the panel answers with no chat open, and every read goes to the files
 * as they are now. What only a live engine can say is in `service.ts`.
 */
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { isFile } from "../../platform/fs";
import {
	BUILTIN_PATH_PREFIX,
	EXTENSION_RESOURCE_SOURCE,
	loadProjectContextFiles,
	parseFrontmatter,
	resolveAllResources,
} from "../../platform/pi";
import type { PathMetadata, ResolvedPaths, ResolvedResource } from "../../platform/pi";
import { listPackages } from "../packages";
import type {
	ContextExtension,
	ContextPackage,
	ContextProblem,
	ContextPrompt,
	ContextView,
} from "./contract";

/** pi's replacing prompt, in the folder pi reads it from. */
const SYSTEM_PROMPT_FILE = "SYSTEM.md";

/** pi's appending prompt, in the folder pi reads it from. */
const APPEND_SYSTEM_PROMPT_FILE = "APPEND_SYSTEM.md";

/** pi cuts a prompt's fallback description here and marks the cut with an ellipsis. */
const PROMPT_DESCRIPTION_MAX = 60;

/** The folder-local file pi prefers over the agent home's copy of the same name. */
const promptFile = (folder: string, name: string): string => join(folder, ".pi", name);

/**
 * What pi reports about a resource: its metadata for a resolved path, or its
 * `sourceInfo` for one a loader found. Both carry the same three fields, so one
 * mapper names the origin the panel shows.
 */
type ResourceOriginInput = Pick<PathMetadata, "source" | "scope" | "origin">;

export const originOf = (meta: ResourceOriginInput): ContextPrompt["origin"] => {
	if (meta.origin === "package") return "package";
	if (meta.source.startsWith(EXTENSION_RESOURCE_SOURCE)) return "extension";
	if (meta.source === "local") return meta.scope === "project" ? "project" : "home";
	return "settings-path";
};

/** The name a row shows: a file's stem, a folder's name, or a built-in's own name. */
export const nameOf = (path: string): string => {
	if (path.startsWith(BUILTIN_PATH_PREFIX)) return path.slice(BUILTIN_PATH_PREFIX.length);
	return basename(path).replace(/\.(ts|js|mjs|cjs|md)$/, "");
};

/**
 * Which prompt files pi reads. This mirrors pi's own discovery
 * (`DefaultResourceLoader.discoverSystemPromptFile`): the project's `.pi` copy wins
 * over the agent home's, and only a trusted folder contributes one. pi's loader
 * answers this only after `reload()`, which installs a missing package, so a read
 * checks the four files instead of loading everything for one path.
 */
const systemPromptSourceOf = async (
	folder: string,
	home: AgentHome,
): Promise<ContextView["systemPrompt"]> => {
	const projectReplace = promptFile(folder, SYSTEM_PROMPT_FILE);
	const homeReplace = join(home.dir, SYSTEM_PROMPT_FILE);
	const projectAppend = promptFile(folder, APPEND_SYSTEM_PROMPT_FILE);
	const homeAppend = join(home.dir, APPEND_SYSTEM_PROMPT_FILE);
	const [projectHas, homeHas, projectAppendHas, homeAppendHas] = await Promise.all([
		isFile(projectReplace),
		isFile(homeReplace),
		isFile(projectAppend),
		isFile(homeAppend),
	]);
	const replacePath = projectHas ? projectReplace : homeHas ? homeReplace : undefined;
	// pi appends the first file it finds, so a project copy replaces the home's.
	const appendPath = projectAppendHas ? projectAppend : homeAppendHas ? homeAppend : undefined;
	const prompt: ContextView["systemPrompt"] = {
		source: projectHas ? "project" : homeHas ? "agent" : "default",
		appendPaths: appendPath === undefined ? [] : [appendPath],
	};
	if (replacePath !== undefined) prompt.replacePath = replacePath;
	return prompt;
};

/** Every context file pi loads, in the order pi applies them. */
const contextFilesOf = (folder: string, home: AgentHome): ContextView["contextFiles"] =>
	loadProjectContextFiles({ cwd: folder, agentDir: home.dir }).map((file, index) => ({
		path: file.path,
		directory: dirname(file.path),
		order: index + 1,
	}));

/** The two frontmatter keys pi reads from a template; every other key pi ignores. */
const promptFrontmatterSchema = z.object({
	description: z.string().optional(),
	"argument-hint": z.string().optional(),
});

/**
 * pi's prompt-template fields. `loadPromptTemplates` is not a root export, so the two
 * fallbacks pi applies in `dist/core/prompt-templates.js` are repeated: the name is
 * the file's, and a missing description is the body's first line, cut at 60.
 */
const promptOf = async (
	resource: ResolvedResource,
): Promise<{ prompt: ContextPrompt; problem?: ContextProblem }> => {
	const row = {
		name: basename(resource.path).replace(/\.md$/, ""),
		path: resource.path,
		origin: originOf(resource.metadata),
		enabled: resource.enabled,
	};
	// pi loads only the paths it resolved as enabled, so a disabled template keeps its name.
	if (!resource.enabled) return { prompt: { ...row, description: "" } };
	let text: string;
	try {
		text = await readFile(resource.path, "utf8");
	} catch (error) {
		return {
			prompt: { ...row, description: "" },
			problem: {
				kind: "prompt",
				message: error instanceof Error ? error.message : "this file cannot be read",
				path: resource.path,
			},
		};
	}
	let body: string;
	let declared: z.infer<typeof promptFrontmatterSchema> | undefined;
	try {
		const parsed = parseFrontmatter(text);
		body = parsed.body;
		// A key of the wrong type reads as absent, the way pi treats one it cannot use.
		const fields = promptFrontmatterSchema.safeParse(parsed.frontmatter);
		if (fields.success) declared = fields.data;
	} catch (error) {
		return {
			prompt: { ...row, description: "" },
			problem: {
				kind: "prompt",
				message: error instanceof Error ? error.message : "the frontmatter cannot be parsed",
				path: resource.path,
			},
		};
	}
	const firstLine = body.split("\n").find((line) => line.trim());
	const description =
		declared?.description !== undefined
			? declared.description
			: firstLine === undefined
				? ""
				: firstLine.length > PROMPT_DESCRIPTION_MAX
					? `${firstLine.slice(0, PROMPT_DESCRIPTION_MAX)}...`
					: firstLine;
	const prompt: ContextPrompt = { ...row, description };
	if (declared?.["argument-hint"] !== undefined && declared["argument-hint"] !== "") {
		prompt.argumentHint = declared["argument-hint"];
	}
	return { prompt };
};

/** The extensions pi resolves from settings and packages. A load adds errors and warnings. */
const extensionViews = (resources: ResolvedResource[]): ContextExtension[] =>
	resources.map((resource) => ({
		path: resource.path,
		name: nameOf(resource.path),
		origin: originOf(resource.metadata),
		enabled: resource.enabled,
		errors: [],
		warnings: [],
	}));

const EMPTY_RESOURCES: ContextPackage["resources"] = {
	extensions: 0,
	skills: 0,
	prompts: 0,
	themes: 0,
};

/**
 * Every package one settings file declares, with how many resources pi resolves from
 * it. A declared package with nothing resolved stays on the list with zeros, because
 * a row that disappears cannot say why its files are missing.
 */
const packageViews = (
	folder: string,
	home: AgentHome,
	resources: ResolvedPaths,
): ContextPackage[] => {
	const counts = new Map<string, ContextPackage["resources"]>();
	const key = (source: string, scope: string): string => `${scope}\0${source}`;
	for (const kind of ["extensions", "skills", "prompts", "themes"] as const) {
		for (const resource of resources[kind]) {
			const { source, scope, origin } = resource.metadata;
			if (origin !== "package") continue;
			const id = key(source, scope);
			const counted = counts.get(id) ?? { ...EMPTY_RESOURCES };
			counted[kind] += 1;
			counts.set(id, counted);
		}
	}
	return listPackages(folder, home).map((row) => ({
		source: row.source,
		scope: row.scope,
		resources: counts.get(key(row.source, row.scope)) ?? EMPTY_RESOURCES,
	}));
};

/** What the files alone decide about a folder. */
export type FileContext = Pick<
	ContextView,
	"contextFiles" | "systemPrompt" | "prompts" | "extensions" | "packages" | "problems"
>;

/**
 * The file-based half of the answer. `resolveAllResources` skips a package that is
 * not installed, so a read never reaches the network the way pi's own `reload()` can.
 */
export const readFiles = async (folder: string, home: AgentHome): Promise<FileContext> => {
	const [systemPrompt, resources] = await Promise.all([
		systemPromptSourceOf(folder, home),
		resolveAllResources(folder, home),
	]);
	const parsed = await Promise.all(resources.prompts.map(promptOf));
	return {
		contextFiles: contextFilesOf(folder, home),
		systemPrompt,
		prompts: parsed.map((entry) => entry.prompt),
		extensions: extensionViews(resources.extensions),
		packages: packageViews(folder, home, resources),
		problems: parsed.flatMap((entry) => (entry.problem === undefined ? [] : [entry.problem])),
	};
};
