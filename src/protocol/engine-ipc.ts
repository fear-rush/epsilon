import { Schema } from "effect";

import { Command } from "./conversation/commands.ts";
import { DialogAnswer } from "./conversation/extui.ts";
import { ServerFrame } from "./conversation/frames.ts";

/**
 * The supervisor's conversation with one engine process.
 *
 * The transport is Bun IPC, which carries structured clones, so there is no framing
 * layer: these schemas are the framing. The engine validates what it receives and the
 * supervisor validates what it gets back; neither trusts the other's memory.
 *
 * Query results are `Unknown` on purpose: each query kind has its own answer shape, and
 * the handler that owns the kind validates it before handing it to a caller.
 */

export const QueryKind = Schema.Literals([
	"tools",
	"models",
	"systemPrompt",
	"mcpLive",
	"extensionSkills",
	"contextLive",
	"autocomplete",
	"export",
	"rename",
	"history",
	"tree",
	"reload",
]);
export type QueryKind = typeof QueryKind.Type;

/** What the supervisor sends. `t` is the tag; every message names the session it is about. */
export const SupervisorToEngine = Schema.Union([
	Schema.Struct({
		t: Schema.Literals(["init"]),
		sessionId: Schema.String,
		/** `null` for a chat pi has not written yet; the first message creates the file. */
		file: Schema.NullOr(Schema.String),
		cwd: Schema.String,
		place: Schema.NullOr(Schema.String),
		homeDir: Schema.String,
		userHome: Schema.String,
	}),
	Schema.Struct({ t: Schema.Literals(["subscribe"]), tab: Schema.String }),
	Schema.Struct({ t: Schema.Literals(["unsubscribe"]), tab: Schema.String }),
	Schema.Struct({
		t: Schema.Literals(["command"]),
		id: Schema.String,
		tab: Schema.String,
		command: Command,
	}),
	Schema.Struct({ t: Schema.Literals(["answer"]), dialogId: Schema.String, answer: DialogAnswer }),
	Schema.Struct({ t: Schema.Literals(["editor"]), tab: Schema.String, text: Schema.String }),
	Schema.Struct({
		t: Schema.Literals(["query"]),
		id: Schema.String,
		kind: QueryKind,
		before: Schema.optional(Schema.String),
		/** The draft an autocomplete query is about, and the caret's offset in it. */
		text: Schema.optional(Schema.String),
		cursor: Schema.optional(Schema.Finite),
	}),
	Schema.Struct({ t: Schema.Literals(["shutdown"]), deadlineMs: Schema.Finite }),
]);
export type SupervisorToEngine = typeof SupervisorToEngine.Type;

/** What the engine sends back. */
export const EngineToSupervisor = Schema.Union([
	Schema.Struct({ t: Schema.Literals(["ready"]), sessionId: Schema.String }),
	/** A frame for every tab or for one; the supervisor forwards it without decoding again. */
	Schema.Struct({
		t: Schema.Literals(["frame"]),
		to: Schema.Union([Schema.Literals(["all"]), Schema.Struct({ tab: Schema.String })]),
		frame: ServerFrame,
	}),
	/** The answer to a `command` or `query`. `value` is validated by the caller that asked. */
	Schema.Struct({
		t: Schema.Literals(["reply"]),
		id: Schema.String,
		ok: Schema.Boolean,
		value: Schema.optional(Schema.Unknown),
		error: Schema.optional(Schema.String),
	}),
	/** A runtime replacement moved the session id: `/new`, a switch or a fork. */
	Schema.Struct({
		t: Schema.Literals(["rekey"]),
		from: Schema.String,
		to: Schema.String,
	}),
	Schema.Struct({
		t: Schema.Literals(["status"]),
		sessionId: Schema.String,
		busy: Schema.Boolean,
		needsInput: Schema.Boolean,
	}),
	Schema.Struct({
		t: Schema.Literals(["heartbeat"]),
		seq: Schema.Finite,
		loopLagMs: Schema.Finite,
		rss: Schema.Finite,
		heapUsed: Schema.Finite,
		childPids: Schema.Array(Schema.Finite),
	}),
	/** Sent before exiting on an uncaught error, so the crash record has a cause. */
	Schema.Struct({
		t: Schema.Literals(["fatal"]),
		message: Schema.String,
		stack: Schema.optional(Schema.String),
	}),
	/** Written to the parent's engine log; one process writes files. */
	Schema.Struct({
		t: Schema.Literals(["log"]),
		level: Schema.Literals(["debug", "info", "warn", "error"]),
		message: Schema.String,
		fields: Schema.optional(
			Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
		),
	}),
	Schema.Struct({ t: Schema.Literals(["idle"]) }),
]);
export type EngineToSupervisor = typeof EngineToSupervisor.Type;

export const decodeSupervisorMessage = Schema.decodeUnknownSync(SupervisorToEngine);
export const decodeEngineMessage = Schema.decodeUnknownSync(EngineToSupervisor);
