/**
 * The socket contract: one zod union per direction, and both sides parse with these schemas.
 *
 * Epsilon owns the command vocabulary: an embedded engine has no wire envelope,
 * so `command` names what the page wants and the server maps it onto the SDK.
 * `event` still carries pi's JSON session event, which is the reducer's input.
 */
import { z } from "zod";

import type { SnapshotMessage } from "../conversation/state";
import { dialogAnswerSchema, dialogQuestionSchema, extensionDisplaySchema } from "./extui";
import type { JsonAgentSessionEvent } from "../pi";

/**
 * Bumped whenever a frame's shape changes. The client sends it in `hello` and
 * reloads on a mismatch instead of guessing.
 */
export const PROTOCOL_VERSION = 10;

/** pi's thinking levels. A model supports a subset of them. */
export const thinkingLevelSchema = z.enum([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

/**
 * Where a session runs. A chat runs in Epsilon's one empty chats folder and sees
 * only the agent home's resources; a project runs in a folder the operator opened
 * and trusted, and adds that folder's `.pi`. pi records the folder in the session
 * file, so the place of an existing session is read from there, never sent.
 */
export const placeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("chat") }),
	z.object({ kind: z.literal("project"), path: z.string().min(1) }),
]);

export type Place = z.infer<typeof placeSchema>;

/** The commands a tab may send. */
export const commandNameSchema = z.enum([
	"prompt",
	"abort",
	"bash",
	"set_model",
	"set_thinking_level",
	"set_coding_tools",
	"reload",
	"compact",
	"abort_compaction",
	"set_auto_compaction",
	"cancel_retry",
	"set_auto_retry",
	"abort_bash",
	"clear_queue",
	"navigate_tree",
]);

export type CommandName = z.infer<typeof commandNameSchema>;

/**
 * How a prompt waits when a run is already active: `steer` interrupts it after the
 * current turn's tools, `followUp` waits until it settles. pi needs one to queue a
 * prompt at all, and `steer` alone cannot carry an extension command.
 */
const promptBehaviorSchema = z.enum(["steer", "followUp"]);

export type PromptBehavior = z.infer<typeof promptBehaviorSchema>;

export const commandSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("prompt"),
		text: z.string(),
		behavior: promptBehaviorSchema.optional(),
	}),
	z.object({ type: z.literal("abort") }),
	z.object({ type: z.literal("bash"), command: z.string(), excludeFromContext: z.boolean() }),
	z.object({ type: z.literal("set_model"), provider: z.string(), modelId: z.string() }),
	z.object({ type: z.literal("set_thinking_level"), level: thinkingLevelSchema }),
	/** Turn the tools that run commands and change files on or off for this session. */
	z.object({ type: z.literal("set_coding_tools"), enabled: z.boolean() }),
	z.object({ type: z.literal("reload") }),
	/** Compact now, with optional instructions for the summary. */
	z.object({ type: z.literal("compact"), instructions: z.string().optional() }),
	z.object({ type: z.literal("abort_compaction") }),
	z.object({ type: z.literal("set_auto_compaction"), enabled: z.boolean() }),
	z.object({ type: z.literal("cancel_retry") }),
	z.object({ type: z.literal("set_auto_retry"), enabled: z.boolean() }),
	z.object({ type: z.literal("abort_bash") }),
	/** Drop the prompts pi has queued for the active run. */
	z.object({ type: z.literal("clear_queue") }),
	/**
	 * Go back to an entry of the active branch. pi moves the leaf there, so the next
	 * prompt starts a sibling branch; a user message hands its text back for the
	 * composer, which already has it, so only the move matters here.
	 */
	z.object({ type: z.literal("navigate_tree"), entryId: z.string().min(1) }),
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
	"UNSUPPORTED_FRAME",
	"PROJECT_NOT_TRUSTED",
]);

export const clientFrameSchema = z.discriminatedUnion("t", [
	z.object({ t: z.literal("hello"), protocol: z.number().int(), tabId: z.string() }),
	/**
	 * `place` says where a new session starts. It is ignored for a session that
	 * already has a file, whose folder pi recorded.
	 */
	z.object({ t: z.literal("attach"), sessionId: z.string(), place: placeSchema.optional() }),
	z.object({ t: z.literal("detach"), sessionId: z.string() }),
	z.object({ t: z.literal("command"), sessionId: z.string(), command: commandSchema }),
	z.object({ t: z.literal("dialog"), sessionId: z.string(), answer: dialogAnswerSchema }),
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

/**
 * How full the context window is. Absent when pi cannot say: before the first
 * request and right after a compaction, where it reports the tokens as unknown.
 */
const contextUsageSchema = z.object({
	tokens: z.number().int(),
	contextWindow: z.number().int(),
	percent: z.number(),
});

export type ContextUsage = z.infer<typeof contextUsageSchema>;

/**
 * What the session has cost, over every entry pi keeps, including the history a
 * compaction removed. Tokens are summed, not the current context size.
 */
const sessionStatsSchema = z.object({
	tokens: z.object({
		input: z.number().int(),
		output: z.number().int(),
		cacheRead: z.number().int(),
		cacheWrite: z.number().int(),
		total: z.number().int(),
	}),
	cost: z.number(),
	userMessages: z.number().int(),
	assistantMessages: z.number().int(),
	toolCalls: z.number().int(),
	totalMessages: z.number().int(),
});

export type SessionStats = z.infer<typeof sessionStatsSchema>;

/** Prompts pi holds for a run that is already going, in pi's own order. */
const promptQueueSchema = z.object({
	steering: z.array(z.string()),
	followUp: z.array(z.string()),
});

export type PromptQueue = z.infer<typeof promptQueueSchema>;

/**
 * A message the composer can go back to: one user message of the active branch.
 * The text is whole, because picking it puts it back in the editor.
 */
const snapshotBranchSchema = z.object({ entryId: z.string(), text: z.string() });

export type SnapshotBranch = z.infer<typeof snapshotBranchSchema>;

/** What the transcript page reads from the engine, never from command replies. */
export const snapshotStateSchema = z.object({
	model: snapshotModelSchema.optional(),
	isStreaming: z.boolean(),
	isCompacting: z.boolean(),
	sessionName: z.string().optional(),
	thinkingLevel: thinkingLevelSchema,
	availableThinkingLevels: z.array(thinkingLevelSchema),
	place: placeSchema,
	/** Whether the tools that run commands and change files are active. */
	codingTools: z.boolean(),
	contextUsage: contextUsageSchema.optional(),
	stats: sessionStatsSchema,
	/** An automatic retry is waiting to run again after a failed request. */
	isRetrying: z.boolean(),
	isBashRunning: z.boolean(),
	autoCompaction: z.boolean(),
	autoRetry: z.boolean(),
	queue: promptQueueSchema,
	/** The active branch's user messages, root to leaf: what going back can reach. */
	branches: z.array(snapshotBranchSchema),
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
