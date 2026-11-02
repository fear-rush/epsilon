/**
 * Packages are declared in pi's settings and installed by its own manager. Both
 * the install and the settings write are exported, so the panel calls them
 * instead of copying `pi install` (docs/pi-sdk.md). pi's `local` flag is the
 * project scope, `pi install -l`.
 *
 * A resource switch is a filter in the package's own settings entry, written the
 * way `pi config` writes one: `-<rel>` for off, and `+<rel>` for on when the entry
 * is a project delta over a parent (`autoload: false`). A plain entry has nothing
 * to add back, so turning a resource on removes the pattern.
 */

import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { AgentHome } from "../../platform/agent-home";
import {
	packageManager,
	readPackageEntries,
	resolveAllResources,
	writePackageEntries,
} from "../../platform/pi";
import type { PackageSource, ResolvedResource } from "../../platform/pi";
import type {
	PackageResourceInput,
	PackageResources,
	PackageScope,
	PackageUpdate,
	PackageView,
} from "./contract";

export const listPackages = (folder: string, home: AgentHome): PackageView[] =>
	packageManager(folder, home)
		.listConfiguredPackages()
		.map((entry) => ({
			source: entry.source,
			scope: entry.scope,
			installedPath: entry.installedPath,
		}));

export const installPackage = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<void> => {
	await packageManager(folder, home).installAndPersist(source, { local: scope === "project" });
};

/** The prefixes pi reads as something other than a plain path. */
const NON_LOCAL = ["npm:", "git:", "github:", "http:", "https:", "ssh:", "builtin:"];

/**
 * A local source is declared relative to the settings file that holds it, while pi
 * matches an input source from the process's folder. Only a plain relative path
 * needs rebasing; an absolute path, a URL, a `~` path and a `file:` URL are left
 * for pi to resolve, as they were before. Remove and update both take a source the
 * way `pi` does from a terminal, so both hand pi a path from the process's folder.
 */
const rebasedSource = (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): string => {
	const plainRelative =
		!isAbsolute(source) &&
		!source.startsWith("~") &&
		!source.startsWith("file:") &&
		!NON_LOCAL.some((prefix) => source.startsWith(prefix));
	if (!plainRelative) return source;
	const base = scope === "project" ? resolve(folder, ".pi") : home.dir;
	return resolve(base, source);
};

export const removePackage = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<boolean> =>
	packageManager(folder, home).removeAndPersist(rebasedSource(folder, home, source, scope), {
		local: scope === "project",
	});

/** Which declared packages have a newer version, asked of pi's own checker. */
export const packageUpdates = async (folder: string, home: AgentHome): Promise<PackageUpdate[]> =>
	(await packageManager(folder, home).checkForAvailableUpdates()).map(
		({ source, scope, type }) => ({
			source,
			scope,
			type,
		}),
	);

/**
 * Updates one declared package through pi's updater. A source the settings do not
 * declare is refused before a package manager runs; a failure inside it is pi's own
 * text, which the route hands back verbatim.
 */
export const updatePackage = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<void> => {
	const declared = listPackages(folder, home).some(
		(entry) => entry.source === source && entry.scope === scope,
	);
	if (!declared) throw new Error("No declared package matched that source");
	await packageManager(folder, home).update(rebasedSource(folder, home, source, scope));
};

const nameOf = (path: string): string =>
	basename(path) === "SKILL.md" ? basename(dirname(path)) : basename(path, extname(path));

/** The four kinds of resource a package entry can filter, in pi's order. */
const RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"] as const;

type ResourceType = (typeof RESOURCE_TYPES)[number];

/** One resource pi resolved, with the package root a filter pattern is relative to. */
type PackageResource = {
	path: string;
	name: string;
	enabled: boolean;
	baseDir: string;
};

const resolvedPackageResources = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<Record<ResourceType, PackageResource[]>> => {
	const resolved = await resolveAllResources(folder, home);
	const pick = (list: ResolvedResource[]): PackageResource[] =>
		list
			.filter(
				(entry) =>
					entry.metadata.origin === "package" &&
					entry.metadata.source === source &&
					entry.metadata.scope === scope,
			)
			.map((entry) => ({
				path: entry.path,
				name: nameOf(entry.path),
				enabled: entry.enabled,
				baseDir: entry.metadata.baseDir ?? dirname(entry.path),
			}));
	return {
		extensions: pick(resolved.extensions),
		skills: pick(resolved.skills),
		prompts: pick(resolved.prompts),
		themes: pick(resolved.themes),
	};
};

const toView = ({ path, name, enabled }: PackageResource): PackageResources["skills"][number] => ({
	path,
	name,
	enabled,
});

/**
 * What one declared package provides, grouped from pi's resolver by the source in
 * each resource's metadata. Reading never installs a missing package.
 */
export const packageResources = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<PackageResources> => {
	const found = await resolvedPackageResources(folder, home, source, scope);
	return {
		extensions: found.extensions.map(toView),
		skills: found.skills.map(toView),
		prompts: found.prompts.map(toView),
		themes: found.themes.map(toView),
	};
};

/** The object form of a package entry, which can carry filters and `autoload`. */
type PackageEntry = Exclude<PackageSource, string>;

/**
 * One stored package entry, as pi documents it: a source, an optional `autoload`
 * and one filter array per resource kind. The object is loose, so a key pi does not
 * document survives a switch.
 */
const packageEntryObjectSchema = z.looseObject({
	source: z.string().min(1),
	autoload: z.boolean().optional(),
	extensions: z.array(z.string()).optional(),
	skills: z.array(z.string()).optional(),
	prompts: z.array(z.string()).optional(),
	themes: z.array(z.string()).optional(),
});

/** The `source` of a stored entry; an entry that is neither form is refused. */
const sourceOf = (entry: PackageSource): string => {
	const bare = z.string().safeParse(entry);
	if (bare.success) return bare.data;
	const named = packageEntryObjectSchema.safeParse(entry);
	if (!named.success) {
		throw new Error(
			`A package entry is not a source string or an object with one: ${named.error.issues[0]?.message}`,
		);
	}
	return named.data.source;
};

/** The path a filter entry names, without its `-`, `+` or `!` mark. */
const filterTarget = (entry: string): string =>
	entry.startsWith("-") || entry.startsWith("+") || entry.startsWith("!") ? entry.slice(1) : entry;

/**
 * Turns one package resource on or off in the settings file that declares the
 * package. The filter is the resource's path relative to the package root, which
 * is what pi matches. A project entry with `autoload: false` loads nothing by
 * itself, so turning a resource on there has to name it with `+`.
 */
export const setPackageResource = async (
	folder: string,
	home: AgentHome,
	input: PackageResourceInput,
): Promise<void> => {
	const found = await resolvedPackageResources(folder, home, input.source, input.scope);
	const resource = found[input.type].find((entry) => entry.path === input.path);
	if (resource === undefined) throw new Error("This package does not provide that resource");

	const entries = readPackageEntries(folder, home, input.scope);
	const index = entries.findIndex((entry) => sourceOf(entry) === input.source);
	const current = entries[index];
	if (current === undefined) throw new Error("No declared package matched that source");
	// A string entry gains a filter object; an object keeps its other keys, `autoload: false`
	// included, so a delta over a parent package stays a delta.
	const object = packageEntryObjectSchema.safeParse(current);
	const stored: PackageEntry = object.success ? { ...object.data } : { source: sourceOf(current) };
	const pattern = relative(resource.baseDir, resource.path);
	const kept = (stored[input.type] ?? []).filter((entry) => filterTarget(entry) !== pattern);
	const patterns = input.enabled
		? stored.autoload === false
			? [...kept, `+${pattern}`]
			: kept
		: [...kept, `-${pattern}`];
	stored[input.type] = patterns.length > 0 ? patterns : undefined;

	const filtered = RESOURCE_TYPES.some((key) => stored[key] !== undefined);
	if (filtered) entries[index] = stored;
	// Without a filter a delta has nothing left to differ by, so it goes away and the
	// package inherits its parent again; a plain entry loses its object form.
	else if (stored.autoload === false) entries.splice(index, 1);
	else entries[index] = stored.source;
	await writePackageEntries(folder, home, input.scope, entries);
};
