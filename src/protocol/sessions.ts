import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
	FileUnwritable,
	ProjectNotTrusted,
	ProjectRefused,
	SessionNotFound,
	SessionRunning,
} from "./errors.ts";

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
	/**
	 * The folder the chat ran in no longer exists, checked when the list is read. A chat is
	 * still openable: pi opens the same file with a folder chosen for this run.
	 */
	cwdMissing: Schema.Boolean,
	created: Schema.Finite,
	lastActivity: Schema.Finite,
	messageCount: Schema.Finite,
	parentSession: Schema.NullOr(Schema.String),
	/** Epsilon's own preference, from `pinned-sessions.json`; not pi state. */
	pinned: Schema.Boolean,
});
export type SessionSummary = typeof SessionSummary.Type;

export const SessionList = Schema.Struct({
	sessions: Schema.Array(SessionSummary),
	/** The pins file Epsilon could not read; the list still answers with an empty set. */
	pinsProblem: Schema.optional(Schema.String),
});
export type SessionList = typeof SessionList.Type;

export const SessionsRpcs = RpcGroup.make(
	Rpc.make("sessions.list", { success: SessionList }),
	/** A version per batch of changed rows; the list is refetched, not patched in place. */
	Rpc.make("sessions.changes", { success: Schema.Finite, stream: true }),
	/**
	 * pi's own rename: a `session_info` entry is appended, so a terminal sees it too. A
	 * running chat is refused rather than rewritten under its engine.
	 */
	Rpc.make("sessions.rename", {
		payload: { sessionId: Schema.String, name: Schema.String },
		success: Schema.Void,
		error: Schema.Union([SessionNotFound, SessionRunning, FileUnwritable]),
	}),
	/**
	 * Move a chat into another folder, as pi's own fork: the history is written as a new
	 * session there and the old file goes, so the page follows the new id. The folder must
	 * be trusted first, because pi loads its resources the moment it forks into it.
	 */
	Rpc.make("sessions.move", {
		payload: { sessionId: Schema.String, toDirectory: Schema.String },
		success: Schema.Struct({ sessionId: Schema.String }),
		error: Schema.Union([
			SessionNotFound,
			SessionRunning,
			FileUnwritable,
			ProjectNotTrusted,
			ProjectRefused,
		]),
	}),
	Rpc.make("sessions.remove", {
		payload: { sessionId: Schema.String },
		success: Schema.Void,
		error: Schema.Union([SessionNotFound, SessionRunning, FileUnwritable]),
	}),
	/**
	 * Take a folder's chats off the list together: pi records the folder a chat ran in, so
	 * this is where a project's chats are. Every chat is checked before any file goes, so a
	 * running one refuses the whole answer and leaves the project as it was. The folder and
	 * pi's trust record stay.
	 */
	Rpc.make("sessions.removeProject", {
		payload: { directory: Schema.String },
		success: Schema.Struct({ removed: Schema.Finite }),
		error: Schema.Union([SessionNotFound, SessionRunning, FileUnwritable]),
	}),
	/** Pin is Epsilon's own preference, so only an existing chat may be pinned. */
	Rpc.make("sessions.setPinned", {
		payload: { sessionId: Schema.String, pinned: Schema.Boolean },
		success: Schema.Void,
		error: Schema.Union([SessionNotFound, FileUnwritable]),
	}),
);
