import { join } from "node:path";

import { Effect } from "effect";

import { SessionsRpcs } from "#protocol/sessions";

import { Catalog } from "../catalog/catalog.ts";
import type { StoredSummary } from "../catalog/ingest.ts";
import { AgentHome } from "../platform/agent-home.ts";

/**
 * The chat list over the socket.
 *
 * `list` reconciles the index with the files first, so a chat a terminal pi just wrote is
 * in the answer; the reconcile is incremental, so an unchanged file costs one stat. The
 * newest chat comes first, because that is the one the sidebar opens on.
 */

const newestFirst = (left: StoredSummary, right: StoredSummary): number =>
	right.lastActivity - left.lastActivity;

export const SessionsHandlersLive = SessionsRpcs.toLayer(
	Effect.gen(function* () {
		const catalog = yield* Catalog;
		const home = yield* AgentHome;
		const roots = [join(home.agentDir, "sessions")];

		return {
			"sessions.list": () =>
				Effect.andThen(catalog.sync(roots), catalog.list).pipe(
					Effect.map((rows) =>
						rows.toSorted(newestFirst).map((row) => ({
							cwd: row.cwd,
							created: row.created,
							firstMessage: row.firstMessage,
							id: row.id,
							lastActivity: row.lastActivity,
							messageCount: row.messageCount,
							name: row.name ?? null,
							parentSession: row.parentSession ?? null,
						})),
					),
				),
			"sessions.changes": () => catalog.changes,
		};
	}),
);
