import { Schema } from "effect";

/**
 * What the platform layer reports when the outside world refuses.
 *
 * These are the only errors that cross from `node:*` and pi into Epsilon's Effect code;
 * everything above them sees a domain error or one of these. `reason` carries the
 * operator's sentence, because "EACCES" is not an explanation and "permission denied" is.
 */

export class FileUnreadable extends Schema.TaggedError<
	FileUnreadable,
	{ readonly brand: unique symbol }
>()("FileUnreadable", { path: Schema.String, reason: Schema.String }) {}

export class FileUnwritable extends Schema.TaggedError<
	FileUnwritable,
	{ readonly brand: unique symbol }
>()("FileUnwritable", { path: Schema.String, reason: Schema.String }) {}

/** The file exists and is not the JSON the schema describes. */
export class NotJson extends Schema.TaggedError<NotJson, { readonly brand: unique symbol }>()(
	"NotJson",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {}

/** pi holds the lock; the writer waited its budget and gave up rather than writing anyway. */
export class Locked extends Schema.TaggedError<Locked, { readonly brand: unique symbol }>()(
	"Locked",
	{
		path: Schema.String,
	},
) {}

export class ProcessFailed extends Schema.TaggedError<
	ProcessFailed,
	{ readonly brand: unique symbol }
>()("ProcessFailed", {
	command: Schema.String,
	code: Schema.NullOr(Schema.Finite),
	stderr: Schema.String,
}) {}

export class TimedOut extends Schema.TaggedError<TimedOut, { readonly brand: unique symbol }>()(
	"TimedOut",
	{
		what: Schema.String,
		afterMs: Schema.Finite,
	},
) {}

/** pi's model runtime refused to build: a broken `models.json` or `auth.json`. */
export class RuntimeUnavailable extends Schema.TaggedError<
	RuntimeUnavailable,
	{ readonly brand: unique symbol }
>()("RuntimeUnavailable", {
	reason: Schema.String,
}) {}
