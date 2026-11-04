import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { PackageFailed } from "../errors.ts";

/**
 * Settings → Packages: what pi's settings declare, what each package provides, and the
 * writes that install, remove, update or filter one.
 *
 * pi owns packages. Epsilon calls pi's own installer and settings setters, because a
 * package entry is a filter list pi knows how to write and read; Epsilon never copies
 * `pi install` or invents a package layout. A source is never stored by Epsilon.
 */

/** pi's two package scopes: the home's `settings.json`, or a project's `.pi/settings.json`. */
export const PackageScope = Schema.Literals(["user", "project"]);
export type PackageScope = typeof PackageScope.Type;

/** Which declaration wins when both scopes name the same package. */
export const PackageRelation = Schema.Literals(["own", "overrides", "inherited"]);
export type PackageRelation = typeof PackageRelation.Type;

export const PackageView = Schema.Struct({
	source: Schema.String,
	scope: PackageScope,
	installedPath: Schema.optional(Schema.String),
	/** The settings entry is an object with filters or `autoload`, not a bare source. */
	filtered: Schema.Boolean,
	relation: PackageRelation,
});
export type PackageView = typeof PackageView.Type;

export const PackageListView = Schema.Struct({ packages: Schema.Array(PackageView) });
export type PackageListView = typeof PackageListView.Type;

/** The four resource kinds pi's package filter names. */
export const PackageResourceType = Schema.Literals(["extensions", "skills", "prompts", "themes"]);
export type PackageResourceType = typeof PackageResourceType.Type;

const PackageResource = Schema.Struct({
	path: Schema.String,
	/** The file's name, or the folder of a `SKILL.md`. */
	name: Schema.String,
	enabled: Schema.Boolean,
});
export type PackageResource = typeof PackageResource.Type;

export const PackageResources = Schema.Struct({
	extensions: Schema.Array(PackageResource),
	skills: Schema.Array(PackageResource),
	prompts: Schema.Array(PackageResource),
	themes: Schema.Array(PackageResource),
});
export type PackageResources = typeof PackageResources.Type;

/** One package pi reports a newer version for; local and pinned sources are never checked. */
export const PackageUpdate = Schema.Struct({
	source: Schema.String,
	scope: PackageScope,
	/** Which updater pi would run. */
	type: Schema.Literals(["npm", "git"]),
});
export type PackageUpdate = typeof PackageUpdate.Type;

export const PackageUpdateList = Schema.Struct({ updates: Schema.Array(PackageUpdate) });
export type PackageUpdateList = typeof PackageUpdateList.Type;

/** The install, remove and update payload: one source in one scope. */
export const PackageSourceInput = Schema.Struct({
	source: Schema.NonEmptyString,
	scope: PackageScope,
});
export type PackageSourceInput = typeof PackageSourceInput.Type;

/**
 * One switch on one package resource. The path is checked against what pi resolved for
 * that package, so the panel cannot write a filter for a file that is not there.
 */
export const PackageResourceInput = Schema.Struct({
	source: Schema.NonEmptyString,
	scope: PackageScope,
	type: PackageResourceType,
	path: Schema.NonEmptyString,
	enabled: Schema.Boolean,
});
export type PackageResourceInput = typeof PackageResourceInput.Type;

/** A read or write names the project folder, or null for the home alone. */
const folder = { folder: Schema.NullOr(Schema.String) } as const;

export const PackageRpcs = RpcGroup.make(
	Rpc.make("settings.packages.list", {
		payload: folder,
		success: PackageListView,
	}),
	Rpc.make("settings.packages.resources", {
		payload: { ...folder, ...PackageSourceInput.fields },
		success: PackageResources,
		error: PackageFailed,
	}),
	Rpc.make("settings.packages.updates", {
		payload: folder,
		success: PackageUpdateList,
		error: PackageFailed,
	}),
	Rpc.make("settings.packages.install", {
		payload: { ...folder, ...PackageSourceInput.fields },
		success: Schema.Void,
		error: PackageFailed,
	}),
	Rpc.make("settings.packages.remove", {
		payload: { ...folder, ...PackageSourceInput.fields },
		success: Schema.Void,
		error: PackageFailed,
	}),
	Rpc.make("settings.packages.update", {
		payload: { ...folder, ...PackageSourceInput.fields },
		success: Schema.Void,
		error: PackageFailed,
	}),
	Rpc.make("settings.packages.setResource", {
		payload: { ...folder, input: PackageResourceInput },
		success: Schema.Void,
		error: PackageFailed,
	}),
);
