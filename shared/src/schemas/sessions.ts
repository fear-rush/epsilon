import { z } from "zod";

/**
 * One session file on disk, plus the two facts only the server's live children
 * know. `firstMessage` is pi's own preview, not the whole transcript.
 */
export const sessionSummarySchema = z.object({
	id: z.string(),
	cwd: z.string(),
	name: z.string().optional(),
	created: z.string(),
	modified: z.string(),
	messageCount: z.number().int().nonnegative(),
	firstMessage: z.string(),
	running: z.boolean(),
	needsInput: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListSchema = z.object({
	project: z.string(),
	sessions: z.array(sessionSummarySchema),
});
export type SessionList = z.infer<typeof sessionListSchema>;

/** The two refusals a session route can send. Both leave the file alone. */
export const sessionErrorCodeSchema = z.enum(["SESSION_NOT_FOUND", "SESSION_RUNNING"]);
export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;

export const sessionErrorSchema = z.object({
	code: sessionErrorCodeSchema,
	message: z.string(),
});
export type SessionError = z.infer<typeof sessionErrorSchema>;
