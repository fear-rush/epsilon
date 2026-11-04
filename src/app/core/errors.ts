import { Schema } from "effect";

/**
 * The failures the page names itself, as opposed to a refusal the server already named.
 *
 * The connection's two exist so a page can tell "try again in a moment" from "this answer
 * will never change": the query cache retries the first and leaves the second alone. The
 * third is a choice the browser could not use, carrying the reason a feature wrote.
 */

/** The socket is closed, so a call could not reach the server. */
export class ServerUnreachable extends Schema.TaggedError<
	ServerUnreachable,
	{ readonly brand: unique symbol }
>()("ServerUnreachable", {
	/** True when a call waited for a reconnect and gave up instead of failing at once. */
	waited: Schema.Boolean,
}) {}

/** This page came from another launch of Epsilon. Reconnecting cannot fix it. */
export class PageOutOfDate extends Schema.TaggedError<
	PageOutOfDate,
	{ readonly brand: unique symbol }
>()("PageOutOfDate", {
	reason: Schema.Literals(["version", "token"]),
}) {}

/** The browser could not read or accept what was chosen, and `reason` says why. */
export class LocalRefused extends Schema.TaggedError<
	LocalRefused,
	{ readonly brand: unique symbol }
>()("LocalRefused", {
	reason: Schema.String,
}) {}

/** Whether another attempt could succeed. Only a closed socket is worth waiting out. */
export const isTemporaryFailure = (error: Error): boolean => error instanceof ServerUnreachable;
