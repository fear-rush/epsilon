import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** One refusal shape for every settings route: a sentence the panel can show. */
export const failure = (c: Context, error: Error, status: ContentfulStatusCode = 400) =>
	c.json({ message: error.message }, status);
