/** The session shapes the routes and the catalog share. */
import { z } from "@hono/zod-openapi";

import { problemSchema } from "../../platform/http";

/**
 * One session file on disk, plus the two facts only the server's live children
 * know. `firstMessage` is pi's own preview, not the whole transcript.
 */
const sessionSummarySchema = z
	.object({
		id: z.string(),
		cwd: z.string(),
		name: z.string().optional(),
		created: z.string(),
		modified: z.string(),
		messageCount: z.number().int().nonnegative(),
		firstMessage: z.string(),
		running: z.boolean(),
		needsInput: z.boolean(),
	})
	.openapi("SessionSummary");

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListSchema = z
	.object({
		project: z.string(),
		sessions: z.array(sessionSummarySchema),
	})
	.openapi("SessionList");

/** The two refusals a session route can send. Both leave the file alone. */
const sessionErrorCodeSchema = z.enum(["SESSION_NOT_FOUND", "SESSION_RUNNING"]);

export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;

export const sessionErrorSchema = problemSchema
	.extend({ code: sessionErrorCodeSchema })
	.openapi("SessionError");
