import { Schema } from "effect";

/** The engine could not build a pi runtime for its session. */
export class EngineStartFailed extends Schema.TaggedError<
	EngineStartFailed,
	{ readonly brand: unique symbol }
>()("EngineStartFailed", {
	sessionId: Schema.String,
	reason: Schema.String,
}) {}

/** A session file changed in a way the engine cannot explain, so writing is refused. */
export class SessionWrittenElsewhere extends Schema.TaggedError<
	SessionWrittenElsewhere,
	{ readonly brand: unique symbol }
>()("SessionWrittenElsewhere", {
	sessionId: Schema.String,
	reason: Schema.String,
}) {}

/** The engine was asked to do something its state does not allow right now. */
export class EngineRefused extends Schema.TaggedError<
	EngineRefused,
	{ readonly brand: unique symbol }
>()("EngineRefused", {
	what: Schema.String,
	reason: Schema.String,
}) {}
