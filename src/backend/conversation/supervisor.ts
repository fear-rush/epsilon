import { Clock, Context, Effect, FileSystem, Layer, Ref, Stream } from "effect";

import { EngineCrashLoop } from "#protocol/errors";
import type { EngineStopped } from "#protocol/errors";

import { AgentHome } from "../platform/agent-home.ts";
import type { AgentHomeApi } from "../platform/agent-home.ts";
import { writeText } from "../platform/files.ts";
import { Log } from "../platform/log.ts";
import type { LogApi } from "../platform/log.ts";
import { piVersion } from "../platform/pi.ts";
import { describeExit, startEngine } from "./engine.ts";
import type { EngineSpec, ExitInfo, RemoteEngine } from "./engine.ts";

/**
 * Starts engines, watches them, and writes down how they died.
 *
 * The registry above this decides which chats deserve a process. This file answers the
 * questions a process raises by itself: is it alive, is it out of memory, did it crash
 * three times in a minute, and what should the operator's log say.
 */

export type StartInput = {
	readonly sessionId: string;
	readonly cwd: string;
	readonly file: string | undefined;
	readonly place: string | null;
};

export type SupervisorApi = {
	readonly start: (
		input: StartInput,
	) => Effect.Effect<RemoteEngine, EngineCrashLoop | EngineStopped, FileSystem.FileSystem>;
	readonly stop: (engine: RemoteEngine) => Effect.Effect<void>;
};

export class Supervisor extends Context.Service<Supervisor, SupervisorApi>()(
	"epsilon/Supervisor",
) {}

/** The spawn command, provided once by `main.ts` (or a fake in tests). */
export class EngineSpecService extends Context.Service<EngineSpecService, EngineSpec>()(
	"epsilon/EngineSpec",
) {}

export const EngineSpecLive = (spec: EngineSpec): Layer.Layer<EngineSpecService> =>
	Layer.succeed(EngineSpecService, spec);

const streakWindowMs = 60_000;
const crashLoopLimit = 3;
const softMemoryBytes = 1.5 * 1024 * 1024 * 1024;
const hardMemoryBytes = 3 * 1024 * 1024 * 1024;
const warnAfterMs = 10_000;
const killAfterMs = 30_000;

type Streak = { readonly count: number; readonly firstAt: number };

const safeName = (sessionId: string): string => sessionId.replaceAll(/[^A-Za-z0-9._-]/g, "_");

type CrashRecord = {
	time: string;
	sessionId: string;
	exit: number;
	signal?: string;
	lastLogLines: ReadonlyArray<string>;
	lastHeartbeat: { readonly at: number; readonly rss: number; readonly seq: number } | null;
	piVersion: string;
};

const stopEngine = (engine: RemoteEngine): Effect.Effect<void> => engine.stop(5_000);

export const makeSupervisor = (deps: {
	readonly home: AgentHomeApi;
	readonly log: LogApi;
	readonly spec: EngineSpec;
	readonly fs: FileSystem.FileSystem;
}): SupervisorApi => {
	const streaks = Ref.makeUnsafe<ReadonlyMap<string, Streak>>(new Map());

	/** Three crashes inside the window refuse the chat; the fourth minute is a fresh start. */
	const crashLoop = (sessionId: string): Effect.Effect<void, EngineCrashLoop> =>
		Effect.flatMap(Ref.get(streaks), (map) => {
			const streak = map.get(sessionId);
			if (streak === undefined || streak.count < crashLoopLimit) return Effect.void;
			return Effect.flatMap(Clock.currentTimeMillis, (now) =>
				now - streak.firstAt > streakWindowMs
					? Effect.void
					: Effect.fail(new EngineCrashLoop({ sessionId })),
			);
		});

	const noteCrash = (engine: RemoteEngine, info: ExitInfo): Effect.Effect<void> =>
		Effect.gen(function* () {
			const sessionId = engine.currentSessionId;
			const now = yield* Clock.currentTimeMillis;
			const map = yield* Ref.get(streaks);
			const previous = map.get(sessionId);
			const fresh = previous === undefined || now - previous.firstAt > streakWindowMs;
			const streak: Streak = fresh
				? { count: 1, firstAt: now }
				: { count: previous.count + 1, firstAt: previous.firstAt };
			yield* Ref.set(streaks, new Map([...map, [sessionId, streak]]));

			yield* engine.broadcast({
				id: crypto.randomUUID(),
				kind: "error",
				text: `This chat's engine stopped (${describeExit(info)}). Other chats are unaffected.`,
				t: "notice",
			});

			const lines = yield* engine.recentLogLines;
			const heartbeat = yield* engine.lastHeartbeat;
			const record: CrashRecord = {
				exit: info.code,
				lastHeartbeat:
					heartbeat === undefined
						? null
						: { at: heartbeat.at, rss: heartbeat.rss, seq: heartbeat.seq },
				lastLogLines: lines,
				piVersion,
				sessionId,
				time: new Date(now).toISOString(),
			};
			if (info.signal !== null) record.signal = info.signal;
			const name = `${record.time.replaceAll(":", "-")}-${safeName(sessionId)}.json`;
			yield* writeText(
				`${deps.home.epsilonDir}/crashes/${name}`,
				`${JSON.stringify(record, null, 2)}\n`,
			).pipe(
				Effect.provideService(FileSystem.FileSystem, deps.fs),
				Effect.catchTag("FileUnwritable", (error) =>
					deps.log.write("error", "the crash record could not be written", {
						path: error.path,
						reason: error.reason,
					}),
				),
			);
			yield* deps.log.engine(sessionId).write("error", "engine stopped", {
				exit: info.code,
				signal: info.signal ?? "",
			});
		});

	const watch = (engine: RemoteEngine): Effect.Effect<void> =>
		Effect.gen(function* () {
			yield* engine.forkIn(
				Stream.runForEach(engine.events, (event) =>
					Effect.gen(function* () {
						switch (event.type) {
							case "exit":
								if (!engine.isStopping) yield* noteCrash(engine, event.info);
								return;
							case "fatal":
								yield* deps.log.engine(engine.currentSessionId).write("error", "engine fatal", {
									message: event.message,
									stack: event.stack ?? "",
								});
								return;
							case "log":
								yield* deps.log
									.engine(engine.currentSessionId)
									.write(event.level, event.message, { ...event.fields });
								return;
							case "heartbeat": {
								if (event.heartbeat.rss > hardMemoryBytes) {
									yield* engine.broadcast({
										id: crypto.randomUUID(),
										kind: "error",
										text: "This chat's engine is out of memory and is being closed.",
										t: "notice",
									});
									yield* engine.killNow();
								} else if (event.heartbeat.rss > softMemoryBytes) {
									yield* deps.log
										.engine(engine.currentSessionId)
										.write("warn", "engine over the soft memory cap", {
											rss: event.heartbeat.rss,
										});
								}
								return;
							}
							default:
								return;
						}
					}),
				),
			);
			yield* engine.forkIn(
				Effect.gen(function* () {
					for (;;) {
						yield* Effect.sleep("1 second");
						const heartbeat = yield* engine.lastHeartbeat;
						const now = yield* Clock.currentTimeMillis;
						const silent = now - (heartbeat?.at ?? engine.startedAt);
						if (silent > killAfterMs) {
							yield* engine.broadcast({
								id: crypto.randomUUID(),
								kind: "error",
								text: "This chat's engine is not responding and is being restarted.",
								t: "notice",
							});
							yield* engine.killNow();
							return;
						}
						if (silent > warnAfterMs) {
							yield* engine.broadcast({
								id: crypto.randomUUID(),
								kind: "warning",
								text: "This chat's engine is not responding.",
								t: "notice",
							});
						}
					}
				}),
			);
		});

	const start = (input: StartInput): Effect.Effect<RemoteEngine, EngineCrashLoop | EngineStopped> =>
		Effect.gen(function* () {
			yield* crashLoop(input.sessionId);
			const engine = yield* startEngine({
				cwd: input.cwd,
				file: input.file,
				homeDir: deps.home.agentDir,
				place: input.place,
				sessionId: input.sessionId,
				spec: deps.spec,
				userHome: deps.home.userHome,
			});
			yield* watch(engine);
			return engine;
		});

	return { start, stop: stopEngine } satisfies SupervisorApi;
};

export const SupervisorLive: Layer.Layer<
	Supervisor,
	never,
	AgentHome | Log | EngineSpecService | FileSystem.FileSystem
> = Layer.effect(
	Supervisor,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const log = yield* Log;
		const fs = yield* FileSystem.FileSystem;
		const spec = yield* EngineSpecService;
		return makeSupervisor({ fs, home, log, spec });
	}),
);
