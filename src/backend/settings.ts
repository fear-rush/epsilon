import { join } from "node:path";

import { Context, Effect, Layer, Ref, Schema } from "effect";

import type { EpsilonProblem, EpsilonValues, EpsilonView } from "#protocol/config/general";
import { SettingRefused } from "#protocol/errors";

import { AgentHome } from "./platform/agent-home.ts";
import { JsonDocument } from "./platform/json-document.ts";
import type { JsonDocumentApi, JsonObject } from "./platform/json-document.ts";
import { Log } from "./platform/log.ts";
import type { LogApi } from "./platform/log.ts";

/**
 * Epsilon's own settings, kept apart from pi's.
 *
 * `maxRunning` (G2) is the first one: a chat is a process, and the registry reads the cap
 * before it spawns one. Reading it per attach, instead of once at startup, is what makes
 * a change to it apply to the next chat rather than the next restart.
 *
 * A file that cannot be read is a problem the page shows and the log records; the default
 * is used meanwhile, and every write is refused rather than overwriting what could not be
 * parsed. `JsonDocument` keeps keys this file does not know.
 */

const maxRunningKey = "maxRunning";
const defaultMaxRunning = 8;
const minimumMaxRunning = 1;

type State = {
	readonly problems: ReadonlyArray<EpsilonProblem>;
	readonly settings: EpsilonValues;
};

export type EpsilonSettingsApi = {
	/** What the file holds, and what could not be used from it. */
	readonly view: Effect.Effect<EpsilonView>;
	/** The cap as the file currently states it, read at each engine spawn. */
	readonly maxRunning: Effect.Effect<number>;
	readonly setMaxRunning: (maxRunning: number) => Effect.Effect<void, SettingRefused>;
};

export class EpsilonSettings extends Context.Service<EpsilonSettings, EpsilonSettingsApi>()(
	"epsilon/EpsilonSettings",
) {}

const defaultState: State = {
	problems: [],
	settings: { maxRunning: defaultMaxRunning },
};

/** An integer, so a file that holds `1.5` or `"8"` is a problem rather than a cap. */
const isWhole = Schema.is(Schema.Int);

/** The file as a state: a key that is not a whole number of at least one is a problem. */
const stateOf = (file: JsonObject, path: string): State => {
	const value = file[maxRunningKey];
	if (value === undefined) return defaultState;
	if (isWhole(value) && value >= minimumMaxRunning) {
		return { problems: [], settings: { maxRunning: value } };
	}
	return {
		problems: [
			{
				message: `The ${maxRunningKey} in ${path} is not a whole number of at least ${minimumMaxRunning}; using ${defaultMaxRunning}.`,
				path,
			},
		],
		settings: { maxRunning: defaultMaxRunning },
	};
};

const refused = (path: string, reason: string | undefined): SettingRefused =>
	new SettingRefused({
		key: maxRunningKey,
		reason: `${reason ?? "the lock is held"} (${path})`,
	});

export const makeEpsilonSettings = (deps: {
	readonly path: string;
	readonly document: JsonDocumentApi;
	readonly log: LogApi;
}): Effect.Effect<EpsilonSettingsApi> => {
	const load: Effect.Effect<State> = deps.document.read(deps.path).pipe(
		Effect.map((file) => stateOf(file, deps.path)),
		Effect.catchTags({
			FileUnreadable: (error) =>
				deps.log
					.write("warn", "Epsilon settings could not be read", {
						path: error.path,
						reason: error.reason,
					})
					.pipe(
						Effect.as({
							problems: [
								{
									message: `Epsilon settings could not be read: ${error.reason}`,
									path: error.path,
								},
							],
							settings: defaultState.settings,
						}),
					),
			NotJson: (error) =>
				deps.log
					.write("warn", "Epsilon settings are not JSON", {
						path: error.path,
						reason: error.reason,
					})
					.pipe(
						Effect.as({
							problems: [
								{ message: `Epsilon settings are not JSON: ${error.reason}`, path: error.path },
							],
							settings: defaultState.settings,
						}),
					),
		}),
	);

	return Effect.gen(function* () {
		const state = yield* Ref.make(yield* load);

		const write = (value: number): Effect.Effect<void, SettingRefused> =>
			Effect.gen(function* () {
				yield* deps.document
					.update(deps.path, () => ({ [maxRunningKey]: value }))
					.pipe(
						Effect.catchTags({
							FileUnreadable: (error) => Effect.fail(refused(error.path, error.reason)),
							FileUnwritable: (error) => Effect.fail(refused(error.path, error.reason)),
							Locked: (error) => Effect.fail(refused(error.path, undefined)),
							NotJson: (error) => Effect.fail(refused(error.path, error.reason)),
						}),
					);
				yield* Ref.set(state, yield* load);
			});

		const setMaxRunning = (value: number): Effect.Effect<void, SettingRefused> =>
			value < minimumMaxRunning
				? Effect.fail(
						new SettingRefused({
							key: maxRunningKey,
							reason: `A cap below ${minimumMaxRunning} would refuse every chat.`,
						}),
					)
				: write(value);

		return {
			maxRunning: Ref.get(state).pipe(
				Effect.map((current) => current.settings.maxRunning),
				Effect.withSpan("epsilon/EpsilonSettings.maxRunning"),
			),
			setMaxRunning: Effect.fn("epsilon/EpsilonSettings.setMaxRunning")(setMaxRunning),
			view: Ref.get(state),
		} satisfies EpsilonSettingsApi;
	});
};

export const EpsilonSettingsLive: Layer.Layer<
	EpsilonSettings,
	never,
	AgentHome | JsonDocument | Log
> = Layer.effect(
	EpsilonSettings,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const document = yield* JsonDocument;
		const log = yield* Log;
		return yield* makeEpsilonSettings({
			document,
			log,
			path: join(home.epsilonDir, "settings.json"),
		});
	}),
);
