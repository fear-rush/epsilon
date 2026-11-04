import { Clock, Context, Effect, Layer, Ref, Scope, Semaphore, Stream } from "effect";
import type { FileSystem } from "effect";

import type { Command } from "#protocol/conversation/commands";
import type { ServerFrame } from "#protocol/conversation/frames";
import type { QueryKind } from "#protocol/engine-ipc";
import { EngineLimitReached } from "#protocol/errors";
import type {
	CommandRefused,
	EngineCrashLoop,
	EngineStopped,
	ProjectNotTrusted,
	ProjectRefused,
} from "#protocol/errors";

import { Catalog } from "../catalog/catalog.ts";
import { SessionLocks } from "../catalog/locks.ts";
import type { SessionLocksApi } from "../catalog/locks.ts";
import { ProjectService } from "../config/projects/service.ts";
import { EpsilonSettings } from "../settings.ts";
import type { RemoteEngine } from "./engine.ts";
import { Supervisor } from "./supervisor.ts";

/**
 * Which chats have a process, which tabs are watching them, and how many may run.
 *
 * A chat's id can change under a replacement (`/new`, a fork); every id it ever held keeps
 * reaching the same engine, and closing it forgets every alias it owned, not the engine
 * that replaced it (F3). Attaching, moving and deleting are serialized per chat id so a
 * delete cannot race the process that is still appending (F1).
 *
 * The cap (G2) closes an idle engine before it refuses a new chat. A busy engine is never
 * evicted: a run that is happening is not a slot to reclaim.
 */

export type AttachInput = {
	readonly sessionId: string;
	readonly cwd: string;
	readonly file: string | undefined;
	readonly place: string | null;
	readonly tab: string;
};

export type Lease = {
	readonly engine: RemoteEngine;
	readonly frames: Stream.Stream<ServerFrame>;
	readonly command: (command: Command) => Effect.Effect<unknown, CommandRefused | EngineStopped>;
	readonly query: (
		kind: QueryKind,
		before: string | undefined,
	) => Effect.Effect<unknown, CommandRefused | EngineStopped>;
	readonly release: Effect.Effect<void, never, FileSystem.FileSystem>;
};

export type RunningEngine = {
	readonly sessionId: string;
	readonly pid: number;
	readonly rss: number;
	readonly busy: boolean;
	readonly tabs: number;
};

export type EnginesApi = {
	readonly attach: (
		input: AttachInput,
	) => Effect.Effect<
		Lease,
		EngineLimitReached | EngineCrashLoop | EngineStopped | ProjectNotTrusted | ProjectRefused,
		FileSystem.FileSystem
	>;
	readonly detach: (
		sessionId: string,
		tab: string,
	) => Effect.Effect<void, never, FileSystem.FileSystem>;
	readonly close: (sessionId: string) => Effect.Effect<void, never, FileSystem.FileSystem>;
	readonly withLock: <A, E, R>(
		sessionId: string,
		effect: Effect.Effect<A, E, R>,
	) => Effect.Effect<A, E, R>;
	readonly isRunning: (sessionId: string) => Effect.Effect<boolean>;
	readonly running: Effect.Effect<ReadonlyArray<RunningEngine>>;
	/**
	 * A read-only query to every live engine, for a panel that describes what the open
	 * chats can see. An engine that cannot answer is left out rather than failing the read;
	 * its tabs show the failure in the chat itself.
	 */
	readonly queryAll: (
		kind: QueryKind,
	) => Effect.Effect<
		ReadonlyArray<{ readonly sessionId: string; readonly cwd: string; readonly result: unknown }>
	>;
};

export class Engines extends Context.Service<Engines, EnginesApi>()("epsilon/Engines") {}

const idleCloseMs = 10_000;

type Entry = {
	readonly engine: RemoteEngine;
	readonly aliases: Set<string>;
	readonly tabs: Set<string>;
	readonly cwd: string;
	sessionId: string;
	lastUsed: number;
	rss: number;
	closed: boolean;
};

export const makeEngines = (options: {
	/** Read at each attach: a new cap applies to the next chat, not the next restart. */
	readonly maxRunning: Effect.Effect<number>;
	readonly supervisor: {
		start: (input: {
			sessionId: string;
			cwd: string;
			file: string | undefined;
			place: string | null;
		}) => Effect.Effect<RemoteEngine, EngineCrashLoop | EngineStopped, FileSystem.FileSystem>;
		stop: (engine: RemoteEngine) => Effect.Effect<void, never, FileSystem.FileSystem>;
	};
	readonly scope: Scope.Scope;
	readonly locate: (sessionId: string) => Effect.Effect<{ path: string; cwd: string } | undefined>;
	/** Resolves a folder and refuses when pi does not trust it. */
	readonly trust: (cwd: string) => Effect.Effect<string, ProjectNotTrusted | ProjectRefused>;
}): EnginesApi => {
	/** One map, every alias; the same entry answers for each id the chat held. */
	const byAlias = new Map<string, Entry>();
	const locks = new Map<string, Semaphore.Semaphore>();

	const entries = (): ReadonlyArray<Entry> => Array.from(new Set(byAlias.values()));

	const register = (entry: Entry, alias: string): void => {
		byAlias.set(alias, entry);
		entry.aliases.add(alias);
	};

	const semaphore = (sessionId: string): Semaphore.Semaphore => {
		const existing = locks.get(sessionId);
		if (existing !== undefined) return existing;
		const created = Semaphore.makeUnsafe(1);
		locks.set(sessionId, created);
		return created;
	};

	const withLock: EnginesApi["withLock"] = (sessionId, effect) =>
		Semaphore.withPermits(semaphore(sessionId), 1)(effect);

	const find = (sessionId: string): Entry | undefined => byAlias.get(sessionId);

	const closeEntry = (entry: Entry): Effect.Effect<void, never, FileSystem.FileSystem> =>
		Effect.gen(function* () {
			if (entry.closed) return;
			entry.closed = true;
			for (const alias of entry.aliases) byAlias.delete(alias);
			yield* options.supervisor.stop(entry.engine);
		});

	const idleClose = (entry: Entry): Effect.Effect<void, never, FileSystem.FileSystem> =>
		Effect.gen(function* () {
			yield* Effect.sleep(idleCloseMs);
			const status = yield* entry.engine.currentStatus;
			if (entry.closed || entry.tabs.size > 0 || status.busy || status.needsInput) return;
			yield* withLock(entry.sessionId, closeEntry(entry));
		});

	const evict = (): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
		Effect.gen(function* () {
			const idle = entries()
				.filter((entry) => entry.tabs.size === 0 && !entry.closed)
				.toSorted((left, right) => left.lastUsed - right.lastUsed);
			for (const entry of idle) {
				const status = yield* entry.engine.currentStatus;
				if (status.busy || status.needsInput) continue;
				yield* withLock(entry.sessionId, closeEntry(entry));
				return true;
			}
			const quiet = entries()
				.filter((entry) => entry.tabs.size > 0 && !entry.closed)
				.toSorted((left, right) => left.lastUsed - right.lastUsed);
			for (const entry of quiet) {
				const status = yield* entry.engine.currentStatus;
				if (status.busy || status.needsInput) continue;
				yield* entry.engine.broadcast({
					id: crypto.randomUUID(),
					kind: "warning",
					text: "This chat was closed to free an engine slot. It reopens when you continue.",
					t: "notice",
				});
				yield* withLock(entry.sessionId, closeEntry(entry));
				return true;
			}
			return false;
		});

	/** The last idle tab leaving gives the chat ten more seconds before it is closed. */
	const releaseTab = (
		entry: Entry,
		tab: string,
	): Effect.Effect<void, never, FileSystem.FileSystem> =>
		Effect.gen(function* () {
			entry.tabs.delete(tab);
			yield* entry.engine.detachTab(tab);
			const status = yield* entry.engine.currentStatus;
			if (entry.closed || entry.tabs.size > 0 || status.busy || status.needsInput) return;
			yield* Effect.forkIn(idleClose(entry), options.scope);
		});

	const lease = (entry: Entry, tab: string): Lease => ({
		command: (command) => entry.engine.request((id) => ({ command, id, t: "command", tab })),
		engine: entry.engine,
		frames: entry.engine.frames(tab),
		query: (kind, before) => entry.engine.request((id) => ({ before, id, kind, t: "query" })),
		release: releaseTab(entry, tab),
	});

	const attach: EnginesApi["attach"] = (input) =>
		withLock(
			input.sessionId,
			Effect.gen(function* () {
				const existing = find(input.sessionId);
				if (existing !== undefined) {
					existing.tabs.add(input.tab);
					existing.lastUsed = yield* Clock.currentTimeMillis;
					yield* existing.engine.attachTab(input.tab);
					return lease(existing, input.tab);
				}

				const located =
					input.file === undefined ? yield* options.locate(input.sessionId) : undefined;
				// A folder the operator has not trusted never gets a process, so nothing in it
				// can be read or run whatever pi would load.
				const cwd = yield* options.trust(located?.cwd ?? input.cwd);

				const maxRunning = yield* options.maxRunning;
				if (entries().length >= maxRunning) {
					const evicted = yield* evict();
					if (!evicted) {
						return yield* new EngineLimitReached({
							max: maxRunning,
							running: entries().length,
						});
					}
				}

				const engine = yield* options.supervisor.start({
					cwd,
					file: located?.path ?? input.file,
					place: input.place,
					sessionId: input.sessionId,
				});
				const now = yield* Clock.currentTimeMillis;
				const entry: Entry = {
					aliases: new Set([input.sessionId]),
					closed: false,
					cwd,
					engine,
					lastUsed: now,
					rss: 0,
					sessionId: engine.currentSessionId,
					tabs: new Set([input.tab]),
				};
				register(entry, input.sessionId);
				yield* engine.attachTab(input.tab);

				yield* engine.forkIn(
					Stream.runForEach(engine.events, (event) =>
						Effect.sync(() => {
							switch (event.type) {
								case "rekey":
									entry.sessionId = event.to;
									register(entry, event.to);
									return;
								case "heartbeat":
									entry.rss = event.heartbeat.rss;
									return;
								default:
									return;
							}
						}),
					),
				);
				yield* engine.forkIn(
					Effect.gen(function* () {
						yield* engine.waitExit;
						if (entry.closed) return;
						entry.closed = true;
						for (const alias of entry.aliases) byAlias.delete(alias);
					}),
				);
				return lease(entry, input.tab);
			}),
		);

	const detach: EnginesApi["detach"] = (sessionId, tab) =>
		Effect.gen(function* () {
			const entry = find(sessionId);
			if (entry === undefined) return;
			yield* releaseTab(entry, tab);
		});

	const close: EnginesApi["close"] = (sessionId) =>
		withLock(
			sessionId,
			Effect.gen(function* () {
				const entry = find(sessionId);
				if (entry === undefined) return;
				yield* closeEntry(entry);
			}),
		);

	const isRunning = (sessionId: string): Effect.Effect<boolean> =>
		Effect.sync(() => find(sessionId) !== undefined);

	const running = Effect.sync(() =>
		entries().map((entry) => ({
			busy: Ref.getUnsafe(entry.engine.status).busy,
			pid: entry.engine.pid,
			rss: entry.rss,
			sessionId: entry.engine.currentSessionId,
			tabs: entry.tabs.size,
		})),
	);

	const queryAll: EnginesApi["queryAll"] = (kind) =>
		// The entries are read when the effect runs: a caller may hold this effect from
		// before any chat opened, as the MCP panel's layer does.
		Effect.suspend(() =>
			Effect.forEach(
				entries().filter((entry) => !entry.closed),
				(entry) =>
					entry.engine
						.request((id) => ({ id, kind, t: "query" }))
						.pipe(
							Effect.match({
								onFailure: () => undefined,
								onSuccess: (result) => ({ result, sessionId: entry.sessionId }),
							}),
						),
				{ concurrency: "unbounded" },
			),
		).pipe(
			Effect.map((rows) =>
				rows.filter(
					(
						row,
					): row is {
						readonly cwd: string;
						readonly result: unknown;
						readonly sessionId: string;
					} => row !== undefined,
				),
			),
		);

	return { attach, close, detach, isRunning, queryAll, running, withLock };
};

/** The registry's answer to "does an engine hold this chat?", for the catalog (F1). */
export const SessionLocksFromEngines: Layer.Layer<SessionLocks, never, Engines> = Layer.effect(
	SessionLocks,
	Effect.map(Engines, (engines): SessionLocksApi => ({ isRunning: engines.isRunning })),
);

export const EnginesLive: Layer.Layer<
	Engines,
	never,
	Supervisor | Catalog | EpsilonSettings | ProjectService | FileSystem.FileSystem
> = Layer.effect(
	Engines,
	Effect.gen(function* () {
		const supervisor = yield* Supervisor;
		const catalog = yield* Catalog;
		const settings = yield* EpsilonSettings;
		const projects = yield* ProjectService;
		const scope = yield* Scope.Scope;
		const engines = makeEngines({
			locate: (sessionId) =>
				Effect.map(catalog.locate(sessionId), (row) =>
					row === undefined ? undefined : { cwd: row.cwd, path: row.path },
				),
			maxRunning: settings.maxRunning,
			scope,
			supervisor,
			trust: (cwd) => projects.trusted(cwd),
		});
		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				for (const running of yield* engines.running) {
					yield* engines.close(running.sessionId);
				}
			}).pipe(Effect.ignore),
		);
		return engines;
	}),
);
