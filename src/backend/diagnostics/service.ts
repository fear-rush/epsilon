import { join } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect";

import { CrashRecord } from "#protocol/diagnostics";
import type { DiagnosticsView, RunningEngine } from "#protocol/diagnostics";

import { Engines } from "../conversation/registry.ts";
import { AgentHome } from "../platform/agent-home.ts";
import { readTextIfExists } from "../platform/files.ts";
import { Log } from "../platform/log.ts";
import type { LogApi } from "../platform/log.ts";
import { piVersion } from "../platform/pi.ts";

/**
 * Diagnostics: the engines that are running and the chapter of crashes on disk.
 *
 * A crash record is what the supervisor wrote when an engine died (G4). A record that
 * cannot be decoded is skipped with a log line instead of failing the whole page; the
 * engine that died is already visible through its notice. No message content and no secret
 * is in a record.
 */

const crashLimit = 20;

/** The file as pi's reader wrote it: one JSON object, decoded by the wire schema. */
const CrashText = Schema.fromJsonString(CrashRecord);

export type DiagnosticsServiceApi = {
	readonly read: Effect.Effect<DiagnosticsView>;
};

export class DiagnosticsService extends Context.Service<
	DiagnosticsService,
	DiagnosticsServiceApi
>()("epsilon/DiagnosticsService") {}

export const makeDiagnosticsService = (deps: {
	readonly running: Effect.Effect<ReadonlyArray<RunningEngine>>;
	readonly crashesDir: string;
	readonly fs: FileSystem.FileSystem;
	readonly log: LogApi;
}): DiagnosticsServiceApi => {
	const recordOf = (name: string): Effect.Effect<Option.Option<CrashRecord>> =>
		readTextIfExists(join(deps.crashesDir, name)).pipe(
			Effect.flatMap((text) => {
				if (Option.isNone(text)) return Effect.succeedNone;
				const decoded = Schema.decodeOption(CrashText)(text.value);
				return Option.isSome(decoded)
					? Effect.succeedSome(decoded.value)
					: deps.log
							.write("warn", "a crash record could not be decoded", { name })
							.pipe(Effect.as(Option.none<CrashRecord>()));
			}),
			Effect.catchTag("FileUnreadable", (error) =>
				deps.log
					.write("warn", "a crash record could not be read", {
						path: error.path,
						reason: error.reason,
					})
					.pipe(Effect.as(Option.none<CrashRecord>())),
			),
			Effect.provideService(FileSystem.FileSystem, deps.fs),
		);

	const crashes = Effect.gen(function* () {
		const fs = deps.fs;
		const names = yield* fs.readDirectory(deps.crashesDir).pipe(
			Effect.map((entries) => entries.filter((name) => name.endsWith(".json"))),
			// No crash has happened yet, which is not an error.
			Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed([])),
			Effect.catchTag("PlatformError", (error) =>
				deps.log
					.write("warn", "the crash directory could not be read", {
						reason: error.message,
					})
					.pipe(Effect.as([])),
			),
		);
		const records = yield* Effect.forEach(names, recordOf, { concurrency: 4 });
		return records
			.flatMap((record) => (Option.isSome(record) ? [record.value] : []))
			.toSorted((left, right) => (left.time < right.time ? 1 : -1))
			.slice(0, crashLimit);
	});

	return {
		read: Effect.gen(function* () {
			return {
				crashes: [...(yield* crashes)],
				engines: [...(yield* deps.running)],
				piVersion,
			} satisfies DiagnosticsView;
		}),
	};
};

export const DiagnosticsServiceLive: Layer.Layer<
	DiagnosticsService,
	never,
	AgentHome | Engines | Log | FileSystem.FileSystem
> = Layer.effect(
	DiagnosticsService,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const engines = yield* Engines;
		const log = yield* Log;
		const fs = yield* FileSystem.FileSystem;
		return makeDiagnosticsService({
			crashesDir: join(home.epsilonDir, "crashes"),
			fs,
			log,
			running: engines.running,
		});
	}),
);
