import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/**
 * The chat list, read from the derived index.
 *
 * A row carries what a sidebar needs and nothing that would parse the session file: the
 * catalog answers from SQLite, and the file stays the truth. A change to a batch of rows
 * arrives as a version on `sessions.changes`, so the sidebar refetches instead of polling.
 */

export const SessionSummary = Schema.Struct({
	id: Schema.String,
	cwd: Schema.String,
	/** pi's own session name, when one was set; the sidebar falls back to the first message. */
	name: Schema.NullOr(Schema.String),
	firstMessage: Schema.String,
	created: Schema.Finite,
	lastActivity: Schema.Finite,
	messageCount: Schema.Finite,
	parentSession: Schema.NullOr(Schema.String),
});
export type SessionSummary = typeof SessionSummary.Type;

export const SessionsRpcs = RpcGroup.make(
	Rpc.make("sessions.list", { success: Schema.Array(SessionSummary) }),
	/** A version per batch of changed rows; the list is refetched, not patched in place. */
	Rpc.make("sessions.changes", { success: Schema.Finite, stream: true }),
);
