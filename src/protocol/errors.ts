import { Schema } from "effect";

/** The chat's file is not where the index said it was. */
export class SessionNotFound extends Schema.TaggedError<
	SessionNotFound,
	{ readonly brand: unique symbol }
>()("SessionNotFound", {
	sessionId: Schema.String,
}) {}

/** A chat cannot be moved, copied or deleted while an engine holds it. */
export class SessionRunning extends Schema.TaggedError<
	SessionRunning,
	{ readonly brand: unique symbol }
>()("SessionRunning", {
	sessionId: Schema.String,
}) {}

/** The engine process that owned a chat is gone; the next command starts a new one. */
export class EngineStopped extends Schema.TaggedError<
	EngineStopped,
	{ readonly brand: unique symbol }
>()("EngineStopped", {
	sessionId: Schema.String,
	exitCode: Schema.optional(Schema.Finite),
	signal: Schema.optional(Schema.String),
}) {}

/** The engine refused a command it understood. */
export class CommandRefused extends Schema.TaggedError<
	CommandRefused,
	{ readonly brand: unique symbol }
>()("CommandRefused", {
	command: Schema.String,
	reason: Schema.String,
}) {}

/** A file Epsilon must read is unreadable, and the reason is worth showing. */
export class FileUnreadable extends Schema.TaggedError<
	FileUnreadable,
	{ readonly brand: unique symbol }
>()("FileUnreadable", {
	path: Schema.String,
	reason: Schema.String,
}) {}
