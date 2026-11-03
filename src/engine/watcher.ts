import { hostname } from "node:os";

import { Effect, FileSystem, Option, Queue, Ref, Schema } from "effect";
import type { Scope } from "effect";

import { EngineRefused } from "./errors.ts";
import { describe } from "./runtime.ts";

/**
 * G1: one writer per session file.
 *
 * pi does not lock session files, so a terminal `pi --continue` and this engine can both
 * append. The engine records the size and mtime after each of its own appends; a poll that
 * sees a different file is a foreign write, and the chat goes read-only until it is
 * reloaded from disk. A 250 ms stat per open chat is the price; `fs.watch` on the platform
 * was not used because its events are coalesced and the comparison needs a stat anyway.
 *
 * A second Epsilon process is kept out with an advisory `<file>.epsilon-lock`. pi ignores
 * it; it is Epsilon-only. A stale lock from a dead pid is taken over.
 */

type Stamp = { readonly mtimeMs: number; readonly size: number };

const lockSuffix = ".epsilon-lock";

const stampOf = (path: string): Effect.Effect<Stamp | undefined, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const info = yield* fs.stat(path).pipe(Effect.orElseSucceed(() => undefined));
		if (info === undefined) return undefined;
		return {
			mtimeMs: info.mtime.pipe(Option.getOrUndefined)?.getTime() ?? 0,
			size: Number(info.size),
		};
	});

const sameStamp = (left: Stamp | undefined, right: Stamp | undefined): boolean =>
	left !== undefined &&
	right !== undefined &&
	left.size === right.size &&
	left.mtimeMs === right.mtimeMs;

/** Whether a recorded owner still has a process. A dead owner's lock is stale. */
const isAlive = (pid: number): Effect.Effect<boolean> =>
	Effect.try({
		try: () => {
			process.kill(pid, 0);
			return true;
		},
		catch: (cause) => new EngineRefused({ what: "lock", reason: describe(cause) }),
	}).pipe(Effect.orElseSucceed(() => false));

const LockOwner = Schema.Struct({
	pid: Schema.Finite,
	startedAt: Schema.optional(Schema.String),
	host: Schema.optional(Schema.String),
});
type LockOwner = typeof LockOwner.Type;
const decodeOwner = Schema.decodeUnknownOption(LockOwner);

/** The advisory lock this engine holds on its session file. */
export type SessionLock = {
	/** `false` when another live engine already holds it; then this chat is read-only. */
	readonly acquired: boolean;
	readonly release: Effect.Effect<void>;
};

const claim = (
	path: string,
	content: string,
): Effect.Effect<SessionLock, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const write = fs.writeFileString(path, content, { flag: "wx" });
		const created = yield* write.pipe(
			Effect.as(true),
			Effect.orElseSucceed(() => false),
		);
		if (created) {
			return {
				acquired: true,
				release: fs.remove(path).pipe(Effect.orElseSucceed(() => undefined)),
			} satisfies SessionLock;
		}
		const text = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ""));
		const decoded = decodeOwner(text);
		const owner: LockOwner | undefined = Option.isSome(decoded) ? decoded.value : undefined;
		if (owner !== undefined && owner.pid !== process.pid && (yield* isAlive(owner.pid))) {
			return { acquired: false, release: Effect.void } satisfies SessionLock;
		}
		// Stale or unreadable: take it over. A lock we cannot parse was not written by us.
		yield* fs.remove(path).pipe(Effect.orElseSucceed(() => undefined));
		const retried = yield* fs.writeFileString(path, content, { flag: "wx" }).pipe(
			Effect.as(true),
			Effect.orElseSucceed(() => false),
		);
		return {
			acquired: retried,
			release: retried ? fs.remove(path).pipe(Effect.orElseSucceed(() => undefined)) : Effect.void,
		} satisfies SessionLock;
	});

export const acquireSessionLock = (
	file: string,
): Effect.Effect<SessionLock, never, FileSystem.FileSystem> =>
	claim(
		`${file}${lockSuffix}`,
		JSON.stringify({
			host: hostname(),
			pid: process.pid,
			startedAt: new Date().toISOString(),
		}),
	);

export type WatcherOptions = {
	/** The session file, read every tick: pi creates it on the first message. */
	readonly file: () => string | undefined;
	/** A write this engine did not make. Called once per change. */
	readonly onForeign: (reason: string) => void;
};

export type SessionWatcher = {
	/** Call after an append the engine made, so its own write is not foreign. */
	readonly markOwn: () => void;
	readonly stop: () => void;
};

/**
 * Follow the session file for the engine's life. The loop lives on the caller's scope;
 * `stop` interrupts it early.
 */
export const startWatcher = (
	options: WatcherOptions,
): Effect.Effect<SessionWatcher, never, FileSystem.FileSystem | Scope.Scope> =>
	Effect.gen(function* () {
		const marks = yield* Queue.unbounded<void>();
		const stamp = yield* Ref.make<Stamp | undefined>(undefined);
		let stopped = false;
		const tick = (file: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
			Effect.gen(function* () {
				// Own appends are recorded first: a mark that was queued before this tick
				// names the write the stat below is about to see.
				yield* Queue.takeAll(marks);
				const next = yield* stampOf(file);
				const previous = yield* Ref.get(stamp);
				if (next === undefined) return;
				if (previous === undefined) {
					yield* Ref.set(stamp, next);
					return;
				}
				if (!sameStamp(previous, next)) {
					// pi persists a message after it notifies, so this engine's own mark can
					// arrive a few milliseconds after the write. Give it that window before
					// calling the change foreign; a real second writer is still there after.
					yield* Effect.sleep("50 millis");
					const marksAfter = yield* Queue.takeAll(marks);
					const settled = yield* stampOf(file);
					yield* Ref.set(stamp, settled ?? next);
					if (marksAfter.length > 0 || !sameStamp(next, settled)) return;
					options.onForeign(`The file changed at ${next.size} bytes, not by this engine.`);
				}
			});
		const loop = Effect.gen(function* () {
			for (;;) {
				if (stopped) return;
				const file = options.file();
				if (file === undefined) {
					yield* Queue.takeAll(marks);
				} else {
					yield* tick(file);
				}
				yield* Effect.sleep("250 millis");
			}
		});
		yield* Effect.forkScoped(loop.pipe(Effect.ignoreCause));
		return {
			markOwn: () => {
				Queue.offerUnsafe(marks, undefined);
			},
			stop: () => {
				stopped = true;
			},
		};
	});
