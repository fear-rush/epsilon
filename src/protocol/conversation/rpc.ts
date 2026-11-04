import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { QueryKind } from "../engine-ipc.ts";
import {
	CommandRefused,
	EngineCrashLoop,
	EngineLimitReached,
	EngineStopped,
	ProjectNotTrusted,
	ProjectRefused,
} from "../errors.ts";
import { Command } from "./commands.ts";
import { ServerFrame } from "./frames.ts";

/**
 * One chat over the socket.
 *
 * `attach` is the stream: the server starts or reuses the chat's engine, subscribes this
 * tab, and forwards what the engine says until the tab goes away. Commands and queries are
 * separate calls because they are answered, not streamed, and a caller that reconnects
 * simply asks again.
 *
 * `tab` is the tab's own name for its subscription. A reconnect uses a new one, so the
 * snapshot it gets is a fresh window rather than a replay the page might have missed.
 */
export const ConversationRpcs = RpcGroup.make(
	Rpc.make("conversation.attach", {
		payload: {
			sessionId: Schema.String,
			/** The project a new chat runs in, or null for Epsilon's own chat folder. */
			place: Schema.NullOr(Schema.String),
			tab: Schema.String,
		},
		success: ServerFrame,
		stream: true,
		error: Schema.Union([
			EngineLimitReached,
			EngineCrashLoop,
			EngineStopped,
			ProjectNotTrusted,
			ProjectRefused,
		]),
	}),
	Rpc.make("conversation.command", {
		payload: {
			sessionId: Schema.String,
			tab: Schema.String,
			command: Command,
		},
		success: Schema.Void,
		error: Schema.Union([CommandRefused, EngineStopped]),
	}),
	Rpc.make("conversation.query", {
		payload: {
			sessionId: Schema.String,
			tab: Schema.String,
			kind: QueryKind,
			before: Schema.optional(Schema.String),
			/** The draft an autocomplete query is about, and the caret's offset in it. */
			text: Schema.optional(Schema.String),
			cursor: Schema.optional(Schema.Finite),
		},
		success: Schema.Unknown,
		error: Schema.Union([CommandRefused, EngineStopped]),
	}),
	Rpc.make("conversation.detach", {
		payload: { sessionId: Schema.String, tab: Schema.String },
		success: Schema.Void,
	}),
);
