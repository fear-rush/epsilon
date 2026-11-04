import { isAbsolute, join, relative, sep } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, PubSub, Stream } from "effect";

import type { ConfigChange } from "#protocol/config/settings";

import { AgentHome } from "../platform/agent-home.ts";
import { Log } from "../platform/log.ts";

/**
 * One stream of "a configuration file changed" facts.
 *
 * A change is coarse on purpose: the client refetches the snapshot, and the files remain
 * the truth. A terminal pi writing the same home produces the same events, which is what
 * makes the dashboard and the terminal one agent. The watcher covers the agent home; a
 * project's `.pi` is not under it, so its changes are seen when the page refetches.
 */

export type ConfigChangesApi = {
	readonly changes: Stream.Stream<ConfigChange>;
};

export class ConfigChanges extends Context.Service<ConfigChanges, ConfigChangesApi>()(
	"epsilon/ConfigChanges",
) {}

/** What a path under the agent home means, or undefined for a file Epsilon ignores. */
const changeOf = (agentDir: string, path: string): ConfigChange | undefined => {
	// A platform watcher may report a name relative to the watched folder.
	const absolute = isAbsolute(path) ? path : join(agentDir, path);
	const rel = relative(agentDir, absolute).split(sep).join("/");
	if (rel === "" || rel.startsWith("..")) return undefined;
	if (rel === "settings.json") return "settings";
	if (rel === "models.json" || rel === "auth.json") return "providers";
	if (rel === "mcp.json" || rel === "mcp-auth.json") return "mcp";
	if (rel === "trust.json") return "projects";
	if (rel.startsWith("skills/")) return "skills";
	return undefined;
};

export const ConfigChangesLive: Layer.Layer<
	ConfigChanges,
	never,
	AgentHome | FileSystem.FileSystem | Log
> = Layer.effect(
	ConfigChanges,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const fs = yield* FileSystem.FileSystem;
		const log = yield* Log;
		const pubsub = yield* PubSub.unbounded<ConfigChange>();
		const events = fs.watch(home.agentDir, { recursive: true }).pipe(
			Stream.map((event) => Option.fromUndefinedOr(changeOf(home.agentDir, event.path))),
			Stream.filter(Option.isSome),
			Stream.map((change) => change.value),
			Stream.debounce("200 millis"),
		);
		yield* Stream.runForEach(events, (change) => PubSub.publish(pubsub, change)).pipe(
			Effect.catchTag("PlatformError", (error) =>
				log.write("warn", "the configuration watcher stopped", { reason: error.message }),
			),
			Effect.forkScoped,
		);
		return { changes: Stream.fromPubSub(pubsub) };
	}),
);
