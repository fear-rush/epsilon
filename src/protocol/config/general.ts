import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SettingRefused } from "../errors.ts";

/**
 * Settings → General: Epsilon's own knobs, the ones that are the dashboard's and not
 * pi's.
 *
 * They live in `<home>/.epsilon/settings.json`, never in pi's `settings.json`, because a
 * terminal pi has no use for them and must not inherit them. The wire carries the file's
 * own shape; a key that the file holds and this page does not know stays in the file.
 */

/** The one knobs the page shows; every one has a writer in `src/backend/settings.ts`. */
export const GeneralSettings = Schema.Struct({
	/** How many chat engines may run at once before the registry evicts an idle one. */
	maxRunning: Schema.Int,
});
export type GeneralSettings = typeof GeneralSettings.Type;

/**
 * A settings value Epsilon could not use: a file it could not read, or a key that holds
 * something other than what it promises. The page shows it beside the default it fell
 * back to, so a default is never mistaken for the operator's choice.
 */
export const GeneralProblem = Schema.Struct({
	path: Schema.optional(Schema.String),
	message: Schema.String,
});
export type GeneralProblem = typeof GeneralProblem.Type;

export const GeneralView = Schema.Struct({
	problems: Schema.Array(GeneralProblem),
	settings: GeneralSettings,
});
export type GeneralView = typeof GeneralView.Type;

export const GeneralRpcs = RpcGroup.make(
	Rpc.make("config.general.read", {
		success: GeneralView,
	}),
	Rpc.make("config.general.setMaxRunning", {
		payload: { maxRunning: Schema.Int },
		success: Schema.Void,
		error: SettingRefused,
	}),
);
