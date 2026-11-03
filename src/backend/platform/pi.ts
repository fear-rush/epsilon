import { join } from "node:path";

import { SettingsManager, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Context, Effect, Layer } from "effect";

import { AgentHome } from "./agent-home.ts";
import { RuntimeUnavailable } from "./errors.ts";

/**
 * The only place Epsilon's backend imports pi's configuration exporters.
 *
 * Every reader here takes the directory it works on. That matters: pi's defaults fall
 * back to `getAgentDir()`, which reads `PI_CODING_AGENT_DIR`, so a forgotten argument
 * would silently point at the operator's real home while a test believes it is on a
 * scratch one. (MCP is the exception that forces `main.ts` to export that variable: its
 * config loader takes no directory. See `docs/pi-sdk.md`.)
 */

/** pi's own types, re-exported so no other backend file imports the package. */
export type { SettingsManager } from "@earendil-works/pi-coding-agent";
export type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export type PiConfigApi = {
	/** pi's merged settings for a folder, read through its own manager. */
	readonly settings: (cwd: string) => Effect.Effect<SettingsManager>;
	/** The settings file Epsilon writes with pi's lock. */
	readonly settingsPath: Effect.Effect<string>;
	/** pi's composed model catalog and credential store, built from this home. */
	readonly models: Effect.Effect<ModelRuntime, RuntimeUnavailable>;
};

export class PiConfig extends Context.Service<PiConfig, PiConfigApi>()("epsilon/PiConfig") {}

/** The pinned pi version, for a crash record and Diagnostics. */
export {
	VERSION as piVersion,
	CURRENT_SESSION_VERSION as sessionFormatVersion,
} from "@earendil-works/pi-coding-agent";

export const PiConfigLive: Layer.Layer<PiConfig, never, AgentHome> = Layer.effect(
	PiConfig,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const models = Effect.tryPromise({
			try: () =>
				ModelRuntime.create({
					authPath: join(home.agentDir, "auth.json"),
					modelsPath: join(home.agentDir, "models.json"),
				}),
			catch: (cause) =>
				new RuntimeUnavailable({
					reason: cause instanceof Error ? cause.message : String(cause),
				}),
		});
		return {
			models,
			settings: (cwd: string): Effect.Effect<SettingsManager> =>
				Effect.sync(() => SettingsManager.create(cwd, home.agentDir)),
			settingsPath: Effect.succeed(join(home.agentDir, "settings.json")),
		} satisfies PiConfigApi;
	}),
);
