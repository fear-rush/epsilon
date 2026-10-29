import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { problemSchema } from "shared";

/** One refusal shape for every route: a sentence the panel can show. */
export const errorContent = { "application/json": { schema: problemSchema } };

/**
 * The error a caught value should be shown as. A thrown `Error` is kept; anything
 * else becomes the fallback sentence, with the caught value attached as its cause.
 */
export const toError = (cause: unknown, fallback: string): Error =>
	cause instanceof Error ? cause : new Error(fallback, { cause });

/** A refusal with the status the route declared, so the handler stays typed. */
export const failure = <Status extends ContentfulStatusCode>(
	c: Context,
	error: Error,
	status: Status,
) => c.json({ message: error.message }, status);
