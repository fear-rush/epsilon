import { join } from "node:path";

import { Effect, FileSystem } from "effect";

import { SessionNotFound } from "#protocol/errors";
import { SessionsRpcs } from "#protocol/sessions";

import { AgentHome } from "../platform/agent-home.ts";
import { ProjectService } from "../settings/projects/service.ts";
import { Catalog } from "./catalog.ts";
import type { StoredSummary } from "./ingest.ts";
import { Sessions } from "./operations.ts";
import { Pins } from "./pins.ts";

/**
 * The chat list over the socket, its rename and delete, and the pin Epsilon owns.
 *
 * `list` reconciles the index with the files first, so a chat a terminal pi just wrote is
 * in the answer; the reconcile is incremental, so an unchanged file costs one stat. Pinned
 * chats come first, then the newest, which is the one a reader is likely to want. A rename
 * goes through pi's own append, so a terminal sees it; a running chat is refused.
 */
export const SessionsHandlersLive = SessionsRpcs.toLayer(
	Effect.gen(function* () {
		const catalog = yield* Catalog;
		const sessions = yield* Sessions;
		const pins = yield* Pins;
		const home = yield* AgentHome;
		const projects = yield* ProjectService;
		const fs = yield* FileSystem.FileSystem;
		const roots = [join(home.agentDir, "sessions")];

		const list = Effect.gen(function* () {
			const rows = yield* catalog.sync(roots).pipe(Effect.andThen(catalog.list));
			// One stat per distinct folder, not per chat: a deleted project is the case this
			// flags, and every chat in it answers the same.
			const folders = [...new Set(rows.map((row) => row.cwd))];
			const missing = new Map<string, boolean>();
			for (const folder of folders) {
				// A folder that cannot be read is missing as far as this answer goes, which is
				// what main's directory check did.
				const present = yield* fs.exists(folder).pipe(Effect.orElseSucceed(() => false));
				missing.set(folder, !present);
			}
			const { ids, problem } = yield* pins.read;
			const pinned = (row: StoredSummary): number => (ids.has(row.id) ? 1 : 0);
			const sorted = rows.toSorted((left, right) => {
				const byPin = pinned(right) - pinned(left);
				return byPin === 0 ? right.lastActivity - left.lastActivity : byPin;
			});
			const sessionsView = sorted.map((row) => ({
				cwd: row.cwd,
				cwdMissing: missing.get(row.cwd) ?? false,
				created: row.created,
				firstMessage: row.firstMessage,
				id: row.id,
				lastActivity: row.lastActivity,
				messageCount: row.messageCount,
				name: row.name ?? null,
				parentSession: row.parentSession ?? null,
				pinned: ids.has(row.id),
			}));
			return problem === undefined
				? { sessions: sessionsView }
				: { pinsProblem: problem, sessions: sessionsView };
		});

		return {
			"sessions.list": () => list,
			"sessions.changes": () => catalog.changes,
			"sessions.rename": ({ name, sessionId }) =>
				sessions.rename(sessionId, name).pipe(Effect.asVoid),
			"sessions.move": ({ sessionId, toDirectory }) =>
				Effect.gen(function* () {
					// A fork loads the folder's own resources, so its answer comes first.
					const folder = yield* projects.trusted(toDirectory);
					return yield* sessions.moveToProject(sessionId, folder);
				}),
			"sessions.remove": ({ sessionId }) => sessions.remove(sessionId),
			"sessions.removeProject": ({ directory }) => sessions.removeProject(directory),
			"sessions.setPinned": ({ pinned, sessionId }) =>
				Effect.gen(function* () {
					const row = yield* catalog.locate(sessionId);
					if (row === undefined) return yield* new SessionNotFound({ sessionId });
					return yield* pins.set(sessionId, pinned);
				}),
		};
	}),
);
