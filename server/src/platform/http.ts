/**
 * What every route shares: one refusal shape, one way to answer a failed write,
 * and the settings write that reloads live engines afterwards.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { problemSchema } from "shared";

import type { SessionRegistry } from "../features/conversation/registry";

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

/**
 * One settings write: run it, reload every live engine, answer 204. A refusal is
 * one sentence with status 400. Every settings route goes through here, so the
 * reload and the error shape cannot drift between resources.
 */
export const configWrite = async (
	c: Context,
	engines: SessionRegistry,
	write: () => Promise<void> | void,
): Promise<Response> => {
	try {
		await write();
		engines.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, toError(error, "The settings change failed"), 400);
	}
};
