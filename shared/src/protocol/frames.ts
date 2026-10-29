/**
 * The socket contract: one zod union per direction, exactly as
 * docs/protocol.md writes it. Both sides parse with these schemas.
 *
 * Epsilon owns the command vocabulary: an embedded engine has no wire envelope,
 * so `command` names what the page wants and the server maps it onto the SDK.
 * `event` still carries pi's JSON session event, which is the reducer's input.
 */
import { z } from "zod";

import type { SnapshotMessage } from "../conversation/state";
import { dialogAnswerSchema, dialogQuestionSchema, extensionDisplaySchema } from "../extui";
import type { JsonAgentSessionEvent } from "../pi";

/** The six commands a tab may send. */
export const commandNameSchema = z.enum([
	"prompt",
	"steer",
	"abort",
	"bash",
	"set_model",
	"reload",
]);

export type CommandName = z.infer<typeof commandNameSchema>;

export const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("prompt"), text: z.string() }),
	z.object({ type: z.literal("steer"), text: z.string() }),
	z.object({ type: z.literal("abort") }),
	z.object({ type: z.literal("bash"), command: z.string(), excludeFromContext: z.boolean() }),
	z.object({ type: z.literal("set_model"), provider: z.string(), modelId: z.string() }),
	z.object({ type: z.literal("reload") }),
]);

export type Command = z.infer<typeof commandSchema>;

/**
 * An event is checked as an envelope only: an object with a discriminant. pi's
 * payload behind `type` is pi's own type (`shared/src/pi.ts`), and the reducer
 * reads the parts it draws with its own schemas. A frame that is not an event at
 * all fails here instead of inside a render.
 */
const eventEnvelopeSchema = z.looseObject({ type: z.string().min(1) });

export const agentEventSchema = z.custom<JsonAgentSessionEvent>(
	(value) => eventEnvelopeSchema.safeParse(value).success,
);

/** Every role pi writes into a session file. A new one is a protocol change. */
const messageRoles = [
	"user",
	"assistant",
	"toolResult",
	"system",
	"bashExecution",
	"branchSummary",
	"compactionSummary",
	"custom",
] as const;

const messageEnvelopeSchema = z.looseObject({ role: z.enum(messageRoles) });

const snapshotMessageSchema = z.custom<SnapshotMessage>(
	(value) => messageEnvelopeSchema.safeParse(value).success,
);

export const protocolErrorCodeSchema = z.enum([
	"PROTOCOL_MISMATCH",
	"SESSION_NOT_FOUND",
	"AGENT_START_FAILED",
	"AGENT_FAILED",
	"EXTENSION_ERROR",
	"HOST_NOT_ALLOWED",
	"UNSUPPORTED_FRAME",
]);

export const clientFrameSchema = z.discriminatedUnion("t", [
	z.object({ t: z.literal("hello"), protocol: z.number().int(), tabId: z.string() }),
	z.object({ t: z.literal("attach"), sessionId: z.string() }),
	z.object({ t: z.literal("detach"), sessionId: z.string() }),
	z.object({ t: z.literal("command"), sessionId: z.string(), command: commandSchema }),
	z.object({ t: z.literal("dialog"), sessionId: z.string(), answer: dialogAnswerSchema }),
	z.object({ t: z.literal("terminal"), terminalId: z.string(), input: z.string() }),
	z.object({
		t: z.literal("terminal-resize"),
		terminalId: z.string(),
		cols: z.number().int(),
		rows: z.number().int(),
	}),
	z.object({ t: z.literal("terminal-close"), terminalId: z.string() }),
	z.object({ t: z.literal("ping") }),
]);

/** One entry of the model picker: an identity and a label, nothing else. */
export const snapshotModelSchema = z.object({
	provider: z.string(),
	id: z.string(),
	name: z.string(),
});

export type SnapshotModel = z.infer<typeof snapshotModelSchema>;

/**
 * One entry of the slash palette: what `prompt` expands. `sourceInfo` and the
 * owning resource belong to the resources page (S8).
 */
export const snapshotCommandSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	source: z.enum(["extension", "prompt", "skill"]),
});

export type SnapshotCommand = z.infer<typeof snapshotCommandSchema>;

/** What the transcript page reads from the engine, never from command replies. */
export const snapshotStateSchema = z.object({
	model: snapshotModelSchema.optional(),
	isStreaming: z.boolean(),
	isCompacting: z.boolean(),
	sessionName: z.string().optional(),
});

export type SnapshotState = z.infer<typeof snapshotStateSchema>;

/**
 * What a tab receives on attach. `state`, `models` and `commands` are Epsilon's
 * and are checked field by field; `messages` are pi's, checked for the role the
 * transcript branches on.
 */
export const snapshotSchema = z.object({
	state: snapshotStateSchema,
	messages: z.array(snapshotMessageSchema),
	models: z.array(snapshotModelSchema),
	commands: z.array(snapshotCommandSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export const serverFrameSchema = z.discriminatedUnion("t", [
	z.object({ t: z.literal("welcome"), protocol: z.number().int() }),
	z.object({ t: z.literal("snapshot"), sessionId: z.string(), snapshot: snapshotSchema }),
	z.object({ t: z.literal("event"), sessionId: z.string(), event: agentEventSchema }),
	z.object({
		t: z.literal("dialog"),
		sessionId: z.string(),
		request: dialogQuestionSchema,
	}),
	z.object({ t: z.literal("dialog-closed"), sessionId: z.string(), id: z.string() }),
	z.object({ t: z.literal("ui"), sessionId: z.string(), request: extensionDisplaySchema }),
	z.object({
		t: z.literal("command-result"),
		sessionId: z.string(),
		command: commandNameSchema,
		ok: z.boolean(),
		error: z.string().optional(),
	}),
	z.object({
		t: z.literal("terminal"),
		terminalId: z.string(),
		output: z.string(),
	}),
	z.object({
		t: z.literal("terminal-exit"),
		terminalId: z.string(),
		code: z.number().nullable(),
	}),
	z.object({
		t: z.literal("error"),
		code: protocolErrorCodeSchema,
		message: z.string(),
		sessionId: z.string().optional(),
	}),
	z.object({ t: z.literal("pong") }),
]);

export type ClientFrame = z.infer<typeof clientFrameSchema>;
export type ServerFrame = z.infer<typeof serverFrameSchema>;
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;
