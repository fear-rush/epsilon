import { Schema } from "effect";

/**
 * The two failures the connection itself has, as opposed to a refusal a feature named.
 *
 * They exist so a page can tell "try again in a moment" from "this answer will never
 * change": the query cache retries the first and leaves the second alone.
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

/** Whether another attempt could succeed. Only a closed socket is worth waiting out. */
export const isTemporaryFailure = (error: Error): boolean => error instanceof ServerUnreachable;
