import { basename, dirname, join } from "node:path";

import { Effect, Option, Schema } from "effect";
import type { FileSystem } from "effect";

import type {
	ContextExtension,
	ContextPackage,
	ContextProblem,
	ContextPrompt,
	ContextSystemPrompt,
} from "#protocol/settings/context";

import { withDefined } from "../../../domain/object.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { EXTENSION_RESOURCE_SOURCE, BUILTIN_PATH_PREFIX } from "../../platform/pi.ts";
import type {
	PathMetadata,
	PiContextApi,
	PiPackagesApi,
	ResolvedResource,
	ResolvedPaths,
} from "../../platform/pi.ts";

/**
 * The context a folder decides on disk, asked of pi and not rebuilt. No engine and no
 * session: the page answers with no chat open, and every read goes to the files as they
 * are now. What only a live engine can say is merged in `service.ts`.
 */

const SYSTEM_PROMPT_FILE = "SYSTEM.md";
const APPEND_SYSTEM_PROMPT_FILE = "APPEND_SYSTEM.md";
const PROMPT_DESCRIPTION_MAX = 60;

/** The folder-local file pi prefers over the agent home's copy of the same name. */
const promptFile = (folder: string, name: string): string => join(folder, ".pi", name);

/** The origin the page shows for one resource. */
export const originOf = (
	meta: Pick<PathMetadata, "source" | "scope" | "origin">,
): ContextPrompt["origin"] => {
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

/** The fields pi reads from a prompt template's frontmatter. */
const PromptFrontmatter = Schema.Struct({
	description: Schema.optional(Schema.String),
	"argument-hint": Schema.optional(Schema.String),
});

const isFile = (fs: FileSystem.FileSystem, path: string): Effect.Effect<boolean> =>
	fs.stat(path).pipe(
		Effect.map((info) => info.type === "File"),
		Effect.orElseSucceed(() => false),
	);

/**
 * Which prompt files pi reads. This mirrors pi's own discovery: the project's `.pi`
 * copy wins over the agent home's, and pi appends the first file it finds.
 */
const systemPromptSourceOf = (
	fs: FileSystem.FileSystem,
	folder: string,
	home: AgentHomeApi,
): Effect.Effect<ContextSystemPrompt> =>
	Effect.gen(function* () {
		const projectReplace = promptFile(folder, SYSTEM_PROMPT_FILE);
		const homeReplace = join(home.agentDir, SYSTEM_PROMPT_FILE);
		const projectAppend = promptFile(folder, APPEND_SYSTEM_PROMPT_FILE);
		const homeAppend = join(home.agentDir, APPEND_SYSTEM_PROMPT_FILE);
		const [projectHas, homeHas, projectAppendHas, homeAppendHas] = yield* Effect.all(
			[
				isFile(fs, projectReplace),
				isFile(fs, homeReplace),
				isFile(fs, projectAppend),
				isFile(fs, homeAppend),
			] as const,
			{ concurrency: 4 },
		);
		const replacePath = projectHas ? projectReplace : homeHas ? homeReplace : undefined;
		const appendPath = projectAppendHas ? projectAppend : homeAppendHas ? homeAppend : undefined;
		return withDefined(
			{
				source: projectHas ? "project" : homeHas ? "agent" : "default",
				appendPaths: appendPath === undefined ? [] : [appendPath],
			} satisfies ContextSystemPrompt,
			"replacePath",
			replacePath,
		);
	});

/** The two fallbacks pi applies when a template has no description. */
const describePrompt = (body: string): string => {
	const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
	return firstLine.length > PROMPT_DESCRIPTION_MAX
		? `${firstLine.slice(0, PROMPT_DESCRIPTION_MAX)}...`
		: firstLine;
};

const promptOf = (
	fs: FileSystem.FileSystem,
	context: PiContextApi,
	resource: ResolvedResource,
): Effect.Effect<{ readonly prompt: ContextPrompt; readonly problem?: ContextProblem }> =>
	Effect.gen(function* () {
		const row = {
			name: basename(resource.path).replace(/\.md$/, ""),
			path: resource.path,
			origin: originOf(resource.metadata),
			enabled: resource.enabled,
		};
		if (!resource.enabled) return { prompt: { ...row, description: "" } };
		const text = yield* fs
			.readFileString(resource.path)
			.pipe(Effect.orElseSucceed(() => undefined));
		if (text === undefined) {
			return {
				prompt: { ...row, description: "" },
				problem: {
					kind: "prompt",
					message: "this file cannot be read",
					path: resource.path,
				},
			};
		}
		const parsed = yield* context.frontmatter(text);
		if (parsed === undefined) {
			return {
				prompt: { ...row, description: "" },
				problem: {
					kind: "prompt",
					message: "the frontmatter cannot be parsed",
					path: resource.path,
				},
			};
		}
		const declared = Schema.decodeOption(PromptFrontmatter)(parsed.frontmatter);
		const fields = Option.getOrUndefined(declared);
		const description = fields?.description ?? describePrompt(parsed.body);
		const argumentHint = fields?.["argument-hint"];
		return {
			prompt: withDefined(
				{ ...row, description } satisfies ContextPrompt,
				"argumentHint",
				argumentHint === "" ? undefined : argumentHint,
			),
		};
	});

const extensionOf = (resource: ResolvedResource): ContextExtension => ({
	path: resource.path,
	name: nameOf(resource.path),
	origin: originOf(resource.metadata),
	enabled: resource.enabled,
	errors: [],
	warnings: [],
});

const resourceKey = (source: string, scope: string): string => `${scope}\0${source}`;

const EMPTY_RESOURCES: ResourceCounts = {
	extensions: 0,
	skills: 0,
	prompts: 0,
	themes: 0,
};

/**
 * Every package both settings declare, with how many resources pi resolves from it. A
 * declared package with nothing resolved stays on the list with zeros, because a row
 * that disappears cannot say why its files are missing.
 */
type ResourceCounts = {
	extensions: number;
	skills: number;
	prompts: number;
	themes: number;
};

const packagesOf = (
	declared: ReadonlyArray<{ readonly source: string; readonly scope: "user" | "project" }>,
	resolved: ResolvedPaths,
): ContextPackage[] => {
	const counts = new Map<string, ResourceCounts>();
	const bump = (list: ReadonlyArray<ResolvedResource>, kind: keyof ResourceCounts): void => {
		for (const resource of list) {
			if (resource.metadata.origin !== "package") continue;
			const key = resourceKey(resource.metadata.source, resource.metadata.scope);
			const current = counts.get(key) ?? { ...EMPTY_RESOURCES };
			current[kind] += 1;
			counts.set(key, current);
		}
	};
	bump(resolved.extensions, "extensions");
	bump(resolved.skills, "skills");
	bump(resolved.prompts, "prompts");
	bump(resolved.themes, "themes");
	return declared.map((entry) => ({
		source: entry.source,
		scope: entry.scope,
		resources: counts.get(resourceKey(entry.source, entry.scope)) ?? { ...EMPTY_RESOURCES },
	}));
};

export type ContextFiles = {
	readonly contextFiles: ReadonlyArray<{
		readonly path: string;
		readonly directory: string;
		readonly order: number;
	}>;
	readonly systemPrompt: ContextSystemPrompt;
	readonly prompts: ReadonlyArray<ContextPrompt>;
	readonly extensions: ReadonlyArray<ContextExtension>;
	readonly packages: ReadonlyArray<ContextPackage>;
	readonly problems: ReadonlyArray<ContextProblem>;
};

/** Everything the folder's files decide, with no engine involved. */
export const readContextFiles = (deps: {
	readonly cwd: string;
	readonly home: AgentHomeApi;
	readonly fs: FileSystem.FileSystem;
	readonly context: PiContextApi;
	readonly packages: PiPackagesApi;
}): Effect.Effect<ContextFiles> =>
	Effect.gen(function* () {
		const resolved = yield* deps.packages.resolve.pipe(
			Effect.orElseSucceed(() => ({ extensions: [], prompts: [], skills: [], themes: [] })),
		);
		const files = yield* deps.context.files;
		const systemPrompt = yield* systemPromptSourceOf(deps.fs, deps.cwd, deps.home);
		const promptResults = yield* Effect.forEach(
			resolved.prompts,
			(resource) => promptOf(deps.fs, deps.context, resource),
			{ concurrency: 8 },
		);
		const declared = yield* deps.packages.list;
		return {
			contextFiles: files.map((file, index) => ({
				path: file.path,
				directory: dirname(file.path),
				order: index + 1,
			})),
			systemPrompt,
			prompts: promptResults.map((result) => result.prompt),
			extensions: resolved.extensions.map(extensionOf),
			packages: packagesOf(declared, resolved),
			problems: promptResults.flatMap((result) =>
				result.problem === undefined ? [] : [result.problem],
			),
		};
	});
