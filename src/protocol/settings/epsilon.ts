import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ProjectNotTrusted, ProjectRefused, SkillRefused } from "../errors.ts";
import { GeneralView, EpsilonView } from "./general.ts";
import { McpListView, McpLive } from "./mcp.ts";
import { PackageListView } from "./packages.ts";
import { ProjectStatus } from "./projects.ts";
import { ProvidersView } from "./providers.ts";
import { Readiness } from "./readiness.ts";
import { SkillListView } from "./skills.ts";

/**
 * Settings → the one read the panel opens with, and the change stream it follows.
 *
 * The snapshot is assembled from the features' own answers, so it cannot disagree with
 * a feature page. A change is a coarse fact about a file, not a diff: the client refetches
 * the snapshot, and the file stays the truth.
 */

export const ConfigSnapshot = Schema.Struct({
	/** The project whose `.pi` this snapshot reads beside the home, or null for the home alone. */
	folder: Schema.NullOr(Schema.String),
	project: Schema.NullOr(ProjectStatus),
	/** Epsilon's own settings, from `<epsilonDir>/settings.json`. */
	epsilon: EpsilonView,
	/** pi's `settings.json` rows and the files pi could not load. */
	settings: GeneralView,
	providers: ProvidersView,
	mcp: McpListView,
	mcpLive: McpLive,
	packages: PackageListView,
	skills: SkillListView,
	readiness: Readiness,
});
export type ConfigSnapshot = typeof ConfigSnapshot.Type;

/** What changed under the agent home; the client refetches the snapshot when one arrives. */
export const ConfigChange = Schema.Literals([
	"settings",
	"providers",
	"mcp",
	"packages",
	"skills",
	"projects",
]);
export type ConfigChange = typeof ConfigChange.Type;

export const ConfigRpcs = RpcGroup.make(
	Rpc.make("settings.snapshot", {
		payload: { folder: Schema.NullOr(Schema.String) },
		success: ConfigSnapshot,
		error: Schema.Union([ProjectNotTrusted, ProjectRefused, SkillRefused]),
	}),
	Rpc.make("settings.changes", {
		success: ConfigChange,
		stream: true,
	}),
);
