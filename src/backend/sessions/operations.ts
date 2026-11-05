import { dirname, join } from "node:path";

import { Context, Effect, FileSystem, Layer } from "effect";

import { FileUnwritable, SessionNotFound, SessionRunning } from "#protocol/errors";

import { AgentHome } from "../platform/agent-home.ts";
import { appendText, removePath } from "../platform/files.ts";
import { forkSession } from "../platform/pi.ts";
import { Catalog } from "./catalog.ts";
import type { StoredSummary } from "./ingest.ts";
import { SessionLocks } from "./locks.ts";

/**
 * Changing a chat's file, which is the only way Epsilon writes to pi's sessions.
 *
 * Each operation asks `SessionLocks` first. A running engine appends while the file moves,
 * and the old code lost exactly that race (F1): it passed a Promise to `!` and deleted the
 * file under the writer. Here the check is a real effect, and a held chat fails with
 * `SessionRunning` before anything touches the disk.
 */

export type RenameResult = StoredSummary | undefined;

export type MoveResult = { readonly sessionId: string };

export type SessionsApi = {
	/**
	 * Move a chat into another folder as pi's own fork: the whole history is written as a
	 * new session there, and the old file goes. Nothing is left in two places.
	 */
	readonly moveToProject: (
		sessionId: string,
		toDirectory: string,
	) => Effect.Effect<MoveResult, SessionNotFound | SessionRunning | FileUnwritable>;
	readonly rename: (
		sessionId: string,
		name: string,
	) => Effect.Effect<RenameResult, SessionNotFound | SessionRunning | FileUnwritable>;
	readonly remove: (
		sessionId: string,
	) => Effect.Effect<void, SessionNotFound | SessionRunning | FileUnwritable>;
};

export class Sessions extends Context.Service<Sessions, SessionsApi>()("epsilon/Sessions") {}

export const SessionsLive = Layer.effect(
	Sessions,
	Effect.gen(function* () {
		const catalog = yield* Catalog;
		const locks = yield* SessionLocks;
		const home = yield* AgentHome;
		const fs = yield* FileSystem.FileSystem;
		const withFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
			Effect.provideService(effect, FileSystem.FileSystem, fs);

		/** Locates the chat and refuses it when an engine holds it. */
		const locatable = (
			sessionId: string,
		): Effect.Effect<StoredSummary, SessionNotFound | SessionRunning> =>
			Effect.gen(function* () {
				const row = yield* catalog.locate(sessionId);
				if (row === undefined) return yield* new SessionNotFound({ sessionId });
				if (yield* locks.isRunning(sessionId)) return yield* new SessionRunning({ sessionId });
				return row;
			});

		const moveToProject: SessionsApi["moveToProject"] = (sessionId, toDirectory) =>
			Effect.gen(function* () {
				const row = yield* locatable(sessionId);
				if (row.cwd === toDirectory) return { sessionId };
				const forked = yield* Effect.try({
					try: () => forkSession(row.path, toDirectory, home),
					catch: (cause) =>
						new FileUnwritable({
							path: row.path,
							reason: cause instanceof Error ? cause.message : String(cause),
						}),
				});
				// A second copy would only confuse: the history lives on in the fork.
				yield* withFs(removePath(row.path));
				yield* catalog.sync([dirname(row.path), join(home.agentDir, "sessions")]);
				return { sessionId: forked };
			});

		const rename: SessionsApi["rename"] = (sessionId, name) =>
			Effect.gen(function* () {
				const row = yield* locatable(sessionId);
				// pi's own rename appends a `session_info` entry, so a terminal pi sees it too.
				const entry = {
					id: crypto.randomUUID(),
					parentId: row.leafId,
					timestamp: new Date().toISOString(),
					type: "session_info",
					name,
				};
				yield* withFs(appendText(row.path, `${JSON.stringify(entry)}\n`));
				yield* catalog.sync([dirname(row.path)]);
				return yield* catalog.locate(sessionId);
			});

		const remove: SessionsApi["remove"] = (sessionId) =>
			Effect.gen(function* () {
				const row = yield* locatable(sessionId);
				yield* withFs(removePath(row.path));
				yield* catalog.sync([dirname(row.path)]);
			});

		return { moveToProject, remove, rename };
	}),
);
