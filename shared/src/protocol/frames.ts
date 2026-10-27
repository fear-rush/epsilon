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

import type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "../pi";

/** pi's own vocabulary, never a parallel copy. */
export const rpcCommandSchema = z.custom<RpcCommand>();
export const agentEventSchema = z.custom<JsonAgentSessionEvent>();
export const dialogRequestSchema = z.custom<DialogQuestion>();
export const dialogAnswerSchema = z.custom<RpcExtensionUIResponse>();

/** The extension requests that block the agent until answered. */
export type DialogQuestion = Extract<
	RpcExtensionUIRequest,
	{ method: "select" | "confirm" | "input" | "editor" }
>;

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
 * A snapshot is built from RPC reads, never from server memory. Its payload is
 * pi's, so it is declared here when the reader lands (S3).
 */
export const serverFrameSchema = z.discriminatedUnion("t", [
	z.object({
		t: z.literal("welcome"),
		protocol: z.number().int(),
		serverVersion: z.string(),
	}),
	z.object({ t: z.literal("event"), sessionId: z.string(), event: agentEventSchema }),
	z.object({ t: z.literal("dialog"), sessionId: z.string(), request: dialogRequestSchema }),
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
