import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Context, Effect, Layer, Option, Result, Schema } from "effect";

import type {
	PackageListView,
	PackageRelation,
	PackageResourceInput,
	PackageResources,
	PackageScope,
	PackageUpdate,
	PackageUpdateList,
	PackageView,
} from "#protocol/config/packages";
import { PackageFailed } from "#protocol/errors";

import { withDefined } from "../../../domain/object.ts";
import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { PiConfig } from "../../platform/pi.ts";
import type {
	ConfiguredPackage,
	PackageSource,
	PiPackagesApi,
	ResolvedPaths,
} from "../../platform/pi.ts";

/**
 * Settings → Packages: what pi's settings declare, what each package provides, and the
 * writes that install, remove, update or filter one.
 *
 * pi owns packages: the installer, the settings setters and the resource resolver all
 * come from its manager. This file only decides which declared entry is one row, how a
 * project entry relates to the home's, which resources belong to a source, and where a
 * filter goes. Nothing here writes `settings.json` by hand.
 */

/** The prefixes pi reads as something other than a plain path. */
const NON_LOCAL = ["npm:", "git:", "github:", "http:", "https:", "ssh:", "builtin:"];

/** The four kinds of resource a package entry can filter, in pi's order. */
const RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"] as const;

type ResourceType = (typeof RESOURCE_TYPES)[number];

/** One stored package entry, as pi documents it; unknown keys survive a switch. */
const StoredPackage = Schema.Struct({
	source: Schema.String,
	autoload: Schema.optional(Schema.Boolean),
	extensions: Schema.optional(Schema.Array(Schema.String)),
	skills: Schema.optional(Schema.Array(Schema.String)),
	prompts: Schema.optional(Schema.Array(Schema.String)),
	themes: Schema.optional(Schema.Array(Schema.String)),
});
const LoosePackage = Schema.StructWithRest(StoredPackage, [
	Schema.Record(Schema.String, Schema.Unknown),
]);
type LoosePackage = typeof LoosePackage.Type;

const failure = (reason: string, source?: string): PackageFailed =>
	new PackageFailed(source === undefined ? { reason } : { reason, source });

const requireProject = (
	folder: string | null,
	what: string,
): Effect.Effect<string, PackageFailed> =>
	folder === null
		? Effect.fail(failure(`Choose a project before ${what}.`))
		: Effect.succeed(folder);

/** The folder a settings file's relative entries resolve against. */
const settingsBaseDir = (home: AgentHomeApi, folder: string | null, scope: PackageScope): string =>
	scope === "user" ? home.agentDir : join(folder ?? home.epsilonDir, ".pi");

/** The folder pi's manager runs in; the home alone has no project layer. */
const managerCwd = (home: AgentHomeApi, folder: string | null): string => folder ?? home.epsilonDir;

/** The identity pi dedupes a package by: an npm name, a resolved local path, else the source. */
const packageIdentity = (
	home: AgentHomeApi,
	folder: string | null,
	source: string,
	scope: PackageScope,
): string => {
	if (source.startsWith("npm:")) {
		const spec = source.slice("npm:".length).trim();
		const at = spec.lastIndexOf("@");
		return `npm:${at > 0 ? spec.slice(0, at) : spec}`;
	}
	const local =
		!source.startsWith("file:") && !NON_LOCAL.some((prefix) => source.startsWith(prefix));
	if (!local) {
		// pi normalizes SSH and HTTPS spellings of a git repo through a private parser
		// Epsilon cannot reach, so a git source is compared as written.
		return source;
	}
	const expanded =
		source === "~"
			? home.userHome
			: source.startsWith("~/")
				? join(home.userHome, source.slice(2))
				: source;
	return `local:${resolve(settingsBaseDir(home, folder, scope), expanded)}`;
};

const rowOf = (entry: ConfiguredPackage, relation: PackageRelation): PackageView =>
	withDefined(
		{
			source: entry.source,
			scope: entry.scope,
			filtered: entry.filtered,
			relation,
		} satisfies PackageView,
		"installedPath",
		entry.installedPath,
	);

/**
 * One row per package. On a project folder that means the project's entries, with the
 * home's entries they leave alone marked `inherited`; an entry whose identity matches a
 * home entry is the single row for that package, marked `overrides`. On the home alone
 * every declared entry is `own`.
 */
const rowsOf = (
	home: AgentHomeApi,
	folder: string | null,
	declared: ReadonlyArray<ConfiguredPackage>,
): ReadonlyArray<PackageView> => {
	if (folder === null) return declared.map((entry) => rowOf(entry, "own"));
	const users = declared.filter((entry) => entry.scope === "user");
	const projects = declared.filter((entry) => entry.scope === "project");
	const userIds = new Set(
		users.map((entry) => packageIdentity(home, folder, entry.source, "user")),
	);
	const projectIds = new Set(
		projects.map((entry) => packageIdentity(home, folder, entry.source, "project")),
	);
	return [
		...projects.map((entry) =>
			rowOf(
				entry,
				userIds.has(packageIdentity(home, folder, entry.source, "project")) ? "overrides" : "own",
			),
		),
		...users
			.filter((entry) => !projectIds.has(packageIdentity(home, folder, entry.source, "user")))
			.map((entry) => rowOf(entry, "inherited")),
	];
};

/**
 * A local source is declared relative to the settings file that holds it, while pi
 * matches an input source from the process's folder. Only a plain relative path needs
 * rebasing; an absolute path, a URL, a `~` path and a `file:` URL are left for pi.
 */
const rebasedSource = (
	home: AgentHomeApi,
	folder: string | null,
	source: string,
	scope: PackageScope,
): string => {
	const plainRelative =
		!isAbsolute(source) &&
		!source.startsWith("~") &&
		!source.startsWith("file:") &&
		!NON_LOCAL.some((prefix) => source.startsWith(prefix));
	return plainRelative ? resolve(settingsBaseDir(home, folder, scope), source) : source;
};

const nameOf = (path: string): string =>
	basename(path) === "SKILL.md" ? basename(dirname(path)) : basename(path, extname(path));

const filterTarget = (entry: string): string =>
	entry.startsWith("-") || entry.startsWith("+") || entry.startsWith("!") ? entry.slice(1) : entry;

/** The `source` of a stored entry, or a refusal when it is neither form. */
const storedOf = (entry: PackageSource): Effect.Effect<LoosePackage, PackageFailed> =>
	Effect.gen(function* () {
		const bare = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(entry));
		if (bare !== undefined) return { source: bare };
		const decoded = Schema.decodeUnknownResult(LoosePackage)(entry);
		if (Result.isFailure(decoded)) {
			return yield* failure(
				`A package entry is not a source string or an object with one: ${decoded.failure.message}`,
			);
		}
		return decoded.success;
	});

const sourceOf = (entry: PackageSource): Effect.Effect<string, PackageFailed> =>
	Effect.map(storedOf(entry), (stored) => stored.source);

/** What one declared package provides, grouped from pi's resolver by the source in each. */
const resourcesOf = (
	resolved: ResolvedPaths,
	source: string,
	scope: PackageScope,
): PackageResources => {
	const pick = (list: ResolvedPaths["skills"]): ReadonlyArray<PackageResources["skills"][number]> =>
		list
			.filter(
				(entry) =>
					entry.metadata.origin === "package" &&
					entry.metadata.source === source &&
					entry.metadata.scope === scope,
			)
			.map((entry) => ({ path: entry.path, name: nameOf(entry.path), enabled: entry.enabled }));
	return {
		extensions: [...pick(resolved.extensions)],
		skills: [...pick(resolved.skills)],
		prompts: [...pick(resolved.prompts)],
		themes: [...pick(resolved.themes)],
	};
};

export type PackageServiceApi = {
	readonly list: (folder: string | null) => Effect.Effect<PackageListView>;
	readonly resources: (
		folder: string | null,
		source: string,
		scope: PackageScope,
	) => Effect.Effect<PackageResources, PackageFailed>;
	readonly updates: (folder: string | null) => Effect.Effect<PackageUpdateList, PackageFailed>;
	readonly install: (
		folder: string | null,
		source: string,
		scope: PackageScope,
	) => Effect.Effect<void, PackageFailed>;
	readonly remove: (
		folder: string | null,
		source: string,
		scope: PackageScope,
	) => Effect.Effect<void, PackageFailed>;
	readonly update: (
		folder: string | null,
		source: string,
		scope: PackageScope,
	) => Effect.Effect<void, PackageFailed>;
	readonly setResource: (
		folder: string | null,
		input: PackageResourceInput,
	) => Effect.Effect<void, PackageFailed>;
};

export class PackageService extends Context.Service<PackageService, PackageServiceApi>()(
	"epsilon/PackageService",
) {}

export const makePackageService = (deps: {
	readonly home: AgentHomeApi;
	readonly packages: (cwd: string) => PiPackagesApi;
}): PackageServiceApi => {
	const api = (folder: string | null): PiPackagesApi =>
		deps.packages(managerCwd(deps.home, folder));

	const list: PackageServiceApi["list"] = Effect.fn("Packages.list")(function* (folder) {
		const declared = yield* api(folder).list;
		return { packages: [...rowsOf(deps.home, folder, declared)] };
	});

	const resources: PackageServiceApi["resources"] = Effect.fn("Packages.resources")(
		function* (folder, source, scope) {
			const resolved = yield* api(folder).resolve;
			return resourcesOf(resolved, source, scope);
		},
	);

	const updates: PackageServiceApi["updates"] = Effect.fn("Packages.updates")(function* (folder) {
		const found = yield* api(folder).updates;
		return {
			updates: found.map(({ source, scope, type }): PackageUpdate => ({ source, scope, type })),
		};
	});

	const install: PackageServiceApi["install"] = Effect.fn("Packages.install")(
		function* (folder, source, scope) {
			const target =
				scope === "project"
					? yield* requireProject(folder, "installing a project package")
					: folder;
			yield* api(target).install(source, scope === "project");
		},
	);

	const remove: PackageServiceApi["remove"] = Effect.fn("Packages.remove")(
		function* (folder, source, scope) {
			const target =
				scope === "project" ? yield* requireProject(folder, "removing a project package") : folder;
			const removed = yield* api(target).remove(
				rebasedSource(deps.home, folder, source, scope),
				scope === "project",
			);
			if (!removed) return yield* failure("No declared package matched that source", source);
			return undefined;
		},
	);

	const update: PackageServiceApi["update"] = Effect.fn("Packages.update")(
		function* (folder, source, scope) {
			const target =
				scope === "project" ? yield* requireProject(folder, "updating a project package") : folder;
			const packageApi = api(target);
			const declared = yield* packageApi.list;
			if (!declared.some((entry) => entry.source === source && entry.scope === scope)) {
				return yield* failure("No declared package matched that source", source);
			}
			yield* packageApi.update(rebasedSource(deps.home, folder, source, scope));
			return undefined;
		},
	);

	const setResource: PackageServiceApi["setResource"] = Effect.fn("Packages.setResource")(
		function* (folder, input) {
			const target =
				input.scope === "project"
					? yield* requireProject(folder, "changing a project package")
					: folder;
			const packageApi = api(target);
			const resolved = yield* packageApi.resolve;
			const resource = resolved[input.type].find(
				(entry) =>
					entry.path === input.path &&
					entry.metadata.origin === "package" &&
					entry.metadata.source === input.source &&
					entry.metadata.scope === input.scope,
			);
			if (resource === undefined) {
				return yield* failure("This package does not provide that resource", input.source);
			}

			const entries = [...(yield* packageApi.entries(input.scope))];
			const sources = yield* Effect.forEach(entries, sourceOf, { concurrency: 1 });
			const index = sources.findIndex((source) => source === input.source);
			const current = entries[index];
			if (current === undefined) {
				return yield* failure("No declared package matched that source", input.source);
			}
			const stored = yield* storedOf(current);
			const baseDir = resource.metadata.baseDir ?? dirname(resource.path);
			const pattern = relative(baseDir, resource.path).split(sep).join("/");
			const kept = (stored[input.type] ?? []).filter((entry) => filterTarget(entry) !== pattern);
			const patterns = input.enabled
				? stored.autoload === false
					? [...kept, `+${pattern}`]
					: kept
				: [...kept, `-${pattern}`];
			const filters: Record<ResourceType, string[] | undefined> = {
				extensions: stored.extensions === undefined ? undefined : [...stored.extensions],
				skills: stored.skills === undefined ? undefined : [...stored.skills],
				prompts: stored.prompts === undefined ? undefined : [...stored.prompts],
				themes: stored.themes === undefined ? undefined : [...stored.themes],
			};
			filters[input.type] = patterns.length > 0 ? patterns : undefined;
			const known = withDefined(
				withDefined(
					withDefined(
						withDefined(
							withDefined({ source: stored.source }, "autoload", stored.autoload),
							"extensions",
							filters.extensions,
						),
						"skills",
						filters.skills,
					),
					"prompts",
					filters.prompts,
				),
				"themes",
				filters.themes,
			);
			// A key pi does not document survives a switch here, as it does in its own file.
			const unknown = Object.fromEntries(
				Object.entries(stored).filter(
					([key]) => !["source", "autoload", ...RESOURCE_TYPES].includes(key),
				),
			);
			const next = { ...unknown, ...known };

			const filtered = RESOURCE_TYPES.some((key) => known[key] !== undefined);
			if (filtered) entries[index] = next;
			// Without a filter a delta has nothing left to differ by, so it goes away and the
			// package inherits its parent again; a plain entry loses its object form.
			else if (known.autoload === false) entries.splice(index, 1);
			else entries[index] = known.source;
			yield* packageApi.writeEntries(input.scope, entries);
			return undefined;
		},
	);

	return { install, list, remove, resources, setResource, update, updates };
};

export const PackageServiceLive: Layer.Layer<PackageService, never, AgentHome | PiConfig> =
	Layer.effect(
		PackageService,
		Effect.gen(function* () {
			const home = yield* AgentHome;
			const pi = yield* PiConfig;
			return makePackageService({
				home,
				packages: (cwd) => pi.packages(cwd),
			});
		}),
	);
