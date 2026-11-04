import { join } from "node:path";

import { Effect } from "effect";

import { SessionNotFound } from "#protocol/errors";
import { SessionsRpcs } from "#protocol/sessions";

import { Catalog } from "../catalog/catalog.ts";
import type { StoredSummary } from "../catalog/ingest.ts";
import { Sessions } from "../catalog/operations.ts";
import { AgentHome } from "../platform/agent-home.ts";
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
		const roots = [join(home.agentDir, "sessions")];

		const list = Effect.gen(function* () {
			const rows = yield* catalog.sync(roots).pipe(Effect.andThen(catalog.list));
			const { ids, problem } = yield* pins.read;
			const pinned = (row: StoredSummary): number => (ids.has(row.id) ? 1 : 0);
			const sorted = rows.toSorted((left, right) => {
				const byPin = pinned(right) - pinned(left);
				return byPin === 0 ? right.lastActivity - left.lastActivity : byPin;
			});
			const sessionsView = sorted.map((row) => ({
				cwd: row.cwd,
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
			"sessions.remove": ({ sessionId }) => sessions.remove(sessionId),
			"sessions.setPinned": ({ pinned, sessionId }) =>
				Effect.gen(function* () {
					const row = yield* catalog.locate(sessionId);
					if (row === undefined) return yield* new SessionNotFound({ sessionId });
					return yield* pins.set(sessionId, pinned);
				}),
		};
	}),
);
