import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/**
 * Settings → Diagnostics, read-only: what is running now and how the last engines died.
 *
 * The crash records are the files the supervisor writes (G4), so this view cannot disagree
 * with what is on disk. No message content and no secret is in them.
 */

export const RunningEngine = Schema.Struct({
	sessionId: Schema.String,
	pid: Schema.Finite,
	rss: Schema.Finite,
	busy: Schema.Boolean,
	tabs: Schema.Finite,
	/** Terminal-only extension methods this engine was asked to render, if any. */
	unsupported: Schema.Array(Schema.String),
});
export type RunningEngine = typeof RunningEngine.Type;

export const CrashRecord = Schema.Struct({
	exit: Schema.Finite,
	signal: Schema.optional(Schema.NullOr(Schema.String)),
	lastHeartbeat: Schema.optional(
		Schema.NullOr(Schema.Struct({ at: Schema.Finite, rss: Schema.Finite, seq: Schema.Finite })),
	),
	lastLogLines: Schema.Array(Schema.String),
	piVersion: Schema.String,
	sessionId: Schema.String,
	time: Schema.String,
});
export type CrashRecord = typeof CrashRecord.Type;

export const DiagnosticsView = Schema.Struct({
	engines: Schema.Array(RunningEngine),
	/** Newest first; the page shows the last twenty. */
	crashes: Schema.Array(CrashRecord),
	piVersion: Schema.String,
});
export type DiagnosticsView = typeof DiagnosticsView.Type;

export const DiagnosticsRpcs = RpcGroup.make(
	Rpc.make("diagnostics.read", {
		success: DiagnosticsView,
	}),
	/** Stops the chat's engine; the next command starts a new one from the file. */
	Rpc.make("diagnostics.stop", {
		payload: { sessionId: Schema.String },
		success: Schema.Void,
	}),
);
