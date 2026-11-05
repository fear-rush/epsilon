import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SettingRefused } from "../errors.ts";

/**
 * Settings → General: Epsilon's own knobs, and pi's `settings.json` as a page.
 *
 * Epsilon's knobs live in `<home>/.epsilon/settings.json`, never in pi's file, because a
 * terminal pi has no use for them and must not inherit them. pi's keys are read through
 * pi's own `SettingsManager`, so its merge order (project over home over default) is what
 * the page reports; a write goes through pi's setter, or through `JsonDocument` for the
 * keys pi only reads.
 */

/** The one knobs of Epsilon's own file; every one has a writer in `src/backend/settings.ts`. */
export const EpsilonValues = Schema.Struct({
	/** How many chat engines may run at once before the registry evicts an idle one. */
	maxRunning: Schema.Int,
});
export type EpsilonValues = typeof EpsilonValues.Type;

/**
 * A settings value Epsilon could not use: a file it could not read, or a key that holds
 * something other than what it promises. The page shows it beside the default it fell
 * back to, so a default is never mistaken for the operator's choice.
 */
export const EpsilonProblem = Schema.Struct({
	path: Schema.optional(Schema.String),
	message: Schema.String,
});
export type EpsilonProblem = typeof EpsilonProblem.Type;

export const EpsilonView = Schema.Struct({
	problems: Schema.Array(EpsilonProblem),
	settings: EpsilonValues,
});
export type EpsilonView = typeof EpsilonView.Type;

/**
 * Every value pi stores in `settings.json`, which is JSON's own shapes. The page narrows
 * it per control; pi's getter is what decided the type.
 */
export const SettingValue = Schema.Union([
	Schema.String,
	Schema.Finite,
	Schema.Boolean,
	Schema.Null,
	Schema.Array(Schema.String),
	Schema.Record(Schema.String, Schema.Unknown),
]);
export type SettingValue = typeof SettingValue.Type;

/**
 * Which layer supplies a setting: a project's `.pi/settings.json`, the home's
 * `settings.json`, or pi's built-in default when neither file sets it.
 */
export const SettingScope = Schema.Literals(["project", "global", "default"]);
export type SettingScope = typeof SettingScope.Type;

export const SettingView = Schema.Struct({
	/** What pi resolves, or null when pi refused the value; `error` then says why. */
	value: Schema.NullOr(SettingValue),
	/** pi's own key path in `settings.json`, such as "compaction.reserveTokens". */
	key: Schema.String,
	scope: SettingScope,
	/** The browser cannot apply it; the page lists it read-only with the reason. */
	terminalOnly: Schema.Boolean,
	/** pi's own sentence for a value it refuses. */
	error: Schema.optional(Schema.String),
});
export type SettingView = typeof SettingView.Type;

/**
 * A settings file pi could not load. pi records the error and ignores that file, so every
 * value it holds is absent rather than wrong; the page names the file so a default is
 * never mistaken for the operator's choice.
 */
export const SettingsProblem = Schema.Struct({
	scope: Schema.Literals(["global", "project"]),
	path: Schema.optional(Schema.String),
	message: Schema.String,
});
export type SettingsProblem = typeof SettingsProblem.Type;

export const DefaultModel = Schema.Struct({
	modelId: Schema.String,
	provider: Schema.String,
});
export type DefaultModel = typeof DefaultModel.Type;

/** Where pi reads and writes one folder's sessions, as pi itself resolves it. */
export const SessionDir = Schema.Struct({
	/** pi's default root, or the folder a settings file named. */
	dir: Schema.String,
	/** The settings file that set the folder, or null for pi's own layout. */
	source: Schema.NullOr(Schema.String),
});
export type SessionDir = typeof SessionDir.Type;

export const GeneralView = Schema.Struct({
	defaultModel: Schema.NullOr(DefaultModel),
	problems: Schema.Array(SettingsProblem),
	rows: Schema.Array(SettingView),
	sessions: SessionDir,
});
export type GeneralView = typeof GeneralView.Type;

export const GeneralRpcs = RpcGroup.make(
	Rpc.make("settings.general.read", {
		success: EpsilonView,
	}),
	Rpc.make("settings.general.setMaxRunning", {
		payload: { maxRunning: Schema.Int },
		success: Schema.Void,
		error: SettingRefused,
	}),
	Rpc.make("settings.general.settings", {
		payload: { folder: Schema.NullOr(Schema.String) },
		success: GeneralView,
	}),
	Rpc.make("settings.general.writeSetting", {
		payload: { key: Schema.String, value: Schema.NullOr(SettingValue) },
		success: Schema.Void,
		error: SettingRefused,
	}),
	Rpc.make("settings.general.setDefaultModel", {
		payload: DefaultModel,
		success: Schema.Void,
		error: SettingRefused,
	}),
);
