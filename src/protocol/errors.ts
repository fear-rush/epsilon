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

/** The running-engine cap is reached and every engine is doing work. */
export class EngineLimitReached extends Schema.TaggedError<
	EngineLimitReached,
	{ readonly brand: unique symbol }
>()("EngineLimitReached", {
	running: Schema.Finite,
	max: Schema.Finite,
}) {}

/** One chat crashed three times in a minute, so it is not respawned automatically. */
export class EngineCrashLoop extends Schema.TaggedError<
	EngineCrashLoop,
	{ readonly brand: unique symbol }
>()("EngineCrashLoop", {
	sessionId: Schema.String,
}) {}

/** A file Epsilon must read is unreadable, and the reason is worth showing. */
export class FileUnreadable extends Schema.TaggedError<
	FileUnreadable,
	{ readonly brand: unique symbol }
>()("FileUnreadable", {
	path: Schema.String,
	reason: Schema.String,
}) {}

/** A write Epsilon refused before it touched the file, with the sentence the page shows. */
export class SettingRefused extends Schema.TaggedError<
	SettingRefused,
	{ readonly brand: unique symbol }
>()("SettingRefused", {
	key: Schema.String,
	reason: Schema.String,
}) {}

/** A provider edit Epsilon refused, with the sentence the page shows. */
export class ProviderRefused extends Schema.TaggedError<
	ProviderRefused,
	{ readonly brand: unique symbol }
>()("ProviderRefused", {
	providerId: Schema.String,
	reason: Schema.String,
}) {}

/**
 * An MCP edit Epsilon refused, with the sentence the page shows. `subject` is the server
 * or the file the refusal is about, when one can be named.
 */
export class McpRefused extends Schema.TaggedError<McpRefused, { readonly brand: unique symbol }>()(
	"McpRefused",
	{
		subject: Schema.optional(Schema.String),
		reason: Schema.String,
	},
) {}

/** A skill import Epsilon could not complete, with the sentence the page shows. */
export class ImportFailed extends Schema.TaggedError<
	ImportFailed,
	{ readonly brand: unique symbol }
>()("ImportFailed", {
	reason: Schema.String,
	/** The source the person pasted, when one was involved. */
	source: Schema.optional(Schema.String),
}) {}
