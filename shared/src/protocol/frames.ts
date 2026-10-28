/**
 * The socket contract: one zod union per direction, exactly as
 * docs/protocol.md writes it. Both sides parse with these schemas.
 *
 * Payloads pi owns (`RpcCommand`, events, dialog requests and answers) are
 * declared with `z.custom` so the envelope is still checked. Their fields are
 * validated by pi, and `conversation/reduce.ts` is the one place that reads
 * them.
 */
import { z } from "zod";

import type { DialogQuestion, ExtensionDisplay } from "../pi";
import type { SnapshotMessage } from "../conversation/state";
import type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
} from "../pi";

export const snapshotSchema = z.custom<Snapshot>();

/** pi's own vocabulary, never a parallel copy. */
export const rpcCommandSchema = z.custom<RpcCommand>();
export const agentEventSchema = z.custom<JsonAgentSessionEvent>();
export const dialogRequestSchema = z.custom<DialogQuestion>();

/** An extension UI method that displays something and never waits for an answer. */
export const extensionDisplaySchema = z.custom<ExtensionDisplay>();
export const dialogAnswerSchema = z.custom<RpcExtensionUIResponse>();

export type { DialogQuestion } from "../pi";

export const protocolErrorCodeSchema = z.enum([
	"PROTOCOL_MISMATCH",
	"SESSION_NOT_FOUND",
	"AGENT_BUSY",
	"AGENT_START_FAILED",
	"CHILD_EXITED",
	"UNSUPPORTED_FRAME",
]);

export const clientFrameSchema = z.discriminatedUnion("t", [
	z.object({ t: z.literal("hello"), protocol: z.number().int(), tabId: z.string() }),
	z.object({ t: z.literal("attach"), sessionId: z.string() }),
	z.object({ t: z.literal("detach"), sessionId: z.string() }),
	z.object({ t: z.literal("rpc"), sessionId: z.string(), command: rpcCommandSchema }),
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

/**
 * A snapshot is built from RPC reads, never from server memory. `stats` lands with
 * the resources page (S8) and travels as its own frame when it does.
 */
/**
 * One entry of the model picker. pi's `Model` also carries pricing, input limits
 * and headers; the browser needs an identity and a label, nothing else.
 */
export type SnapshotModel = { provider: string; id: string; name: string };

/**
 * One entry of the slash palette, from `get_commands`. `sourceInfo` and the owning
 * resource belong to the resources page, which lists them with their paths.
 */
export type SnapshotCommand = {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
};

export type Snapshot = {
	state: RpcSessionState;
	messages: SnapshotMessage[];
	/** `get_available_models`, mapped down to what the picker shows. */
	models: SnapshotModel[];
	/** `get_commands`, what `/` may expand to. */
	commands: SnapshotCommand[];
};

export const serverFrameSchema = z.discriminatedUnion("t", [
	z.object({
		t: z.literal("welcome"),
		protocol: z.number().int(),
		serverVersion: z.string(),
	}),
	z.object({ t: z.literal("snapshot"), sessionId: z.string(), snapshot: snapshotSchema }),
	z.object({ t: z.literal("event"), sessionId: z.string(), event: agentEventSchema }),
	z.object({ t: z.literal("dialog"), sessionId: z.string(), request: dialogRequestSchema }),
	z.object({ t: z.literal("dialog-closed"), sessionId: z.string(), id: z.string() }),
	z.object({ t: z.literal("ui"), sessionId: z.string(), request: extensionDisplaySchema }),
	z.object({
		t: z.literal("rpc-result"),
		sessionId: z.string(),
		id: z.string().optional(),
		ok: z.boolean(),
		error: z.string().optional(),
	}),
	z.object({
		t: z.literal("meta"),
		sessionId: z.string(),
		running: z.boolean(),
		needsInput: z.boolean(),
		title: z.string().optional(),
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
/** Outbound replies pi sends, correlated by `id`. */
export type PiResponse = RpcResponse;
