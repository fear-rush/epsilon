import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { Context, Effect } from "effect";

import { AgentHome } from "./agent-home.ts";

/**
 * The only place Epsilon's backend imports pi's configuration exporters.
 *
 * Every reader here takes the directory it works on. That matters: pi's defaults fall
 * back to `getAgentDir()`, which reads `PI_CODING_AGENT_DIR`, so a forgotten argument
 * would silently point at the operator's real home while a test believes it is on a
 * scratch one. (MCP is the exception that forces `main.ts` to export that variable: its
 * config loader takes no directory. See `docs/pi-sdk.md`.)
 */

export type PiConfigApi = {
	/** pi's merged settings for a folder, read through its own manager. */
	readonly settings: (cwd: string) => Effect.Effect<SettingsManager>;
	/** The settings file Epsilon writes with pi's lock. */
	readonly settingsPath: Effect.Effect<string>;
};

export class PiConfig extends Context.Service<PiConfig, PiConfigApi>()("epsilon/PiConfig") {}

export const PiConfigLive = Effect.gen(function* () {
	const home = yield* AgentHome;
	const settings = (cwd: string): Effect.Effect<SettingsManager> =>
		Effect.sync(() => SettingsManager.create(cwd, home.agentDir));
	return {
		settings,
		settingsPath: Effect.succeed(`${home.agentDir}/settings.json`),
	} satisfies PiConfigApi;
});
