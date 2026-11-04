import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ProjectRefused } from "../errors.ts";
import { SettingsProblem } from "./general.ts";

/**
 * Projects: the folders the operator opens, pi's trust decision for each, and the
 * folder picker.
 *
 * A path is the one value the browser sends that names the disk, so the server
 * resolves it to a real directory, refuses the agent home, and (in the dev sandbox)
 * refuses anything outside the sandbox's home. `trusted` is pi's own chain: a folder
 * with nothing pi gates is trusted, a saved parent decision covers it, and
 * `defaultProjectTrust` decides the rest. Nothing runs in a folder until it is true.
 */

export const ProjectStatus = Schema.Struct({
	path: Schema.String,
	name: Schema.String,
	trusted: Schema.Boolean,
	/** The folder holds a `.pi` or `.agents/skills` that pi loads only once trusted. */
	hasProjectResources: Schema.Boolean,
	/** This folder has its own `trust.json` record; a parent's decision covers it otherwise. */
	decidedHere: Schema.Boolean,
	/** The folder above, for pi's "trust parent" choice, or null at the filesystem root. */
	parent: Schema.NullOr(Schema.String),
	/** A project `.pi/settings.json` pi cannot parse; read only when one status is asked for. */
	settingsProblems: Schema.optional(Schema.Array(SettingsProblem)),
});
export type ProjectStatus = typeof ProjectStatus.Type;

export const ProjectTrustAction = Schema.Literals(["trust", "untrust", "forget", "trust-parent"]);
export type ProjectTrustAction = typeof ProjectTrustAction.Type;

/** One level of the folder picker: subfolders only, never file names or contents. */
export const FolderListing = Schema.Struct({
	path: Schema.String,
	/** The folder above, or null at the filesystem root or the sandbox boundary. */
	parent: Schema.NullOr(Schema.String),
	folders: Schema.Array(Schema.Struct({ name: Schema.String, path: Schema.String })),
	/** More subfolders exist than the listing carries. */
	truncated: Schema.Boolean,
});
export type FolderListing = typeof FolderListing.Type;

export const NewFolderInput = Schema.Struct({
	parent: Schema.NonEmptyString,
	name: Schema.NonEmptyString,
});
export type NewFolderInput = typeof NewFolderInput.Type;

export const CreatedFolder = Schema.Struct({ path: Schema.String });
export type CreatedFolder = typeof CreatedFolder.Type;

export const ProjectRpcs = RpcGroup.make(
	Rpc.make("settings.projects.status", {
		payload: { path: Schema.NonEmptyString },
		success: ProjectStatus,
		error: ProjectRefused,
	}),
	Rpc.make("settings.projects.setTrust", {
		payload: { path: Schema.NonEmptyString, action: ProjectTrustAction },
		success: ProjectStatus,
		error: ProjectRefused,
	}),
	Rpc.make("settings.projects.folders", {
		payload: {
			path: Schema.optional(Schema.NonEmptyString),
			hidden: Schema.optional(Schema.Boolean),
		},
		success: FolderListing,
		error: ProjectRefused,
	}),
	Rpc.make("settings.projects.createFolder", {
		payload: NewFolderInput,
		success: CreatedFolder,
		error: ProjectRefused,
	}),
);
