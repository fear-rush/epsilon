/** The session shapes the routes and the catalog share. */
import { z } from "@hono/zod-openapi";

import { problemSchema } from "../../platform/http";
import { projectStatusSchema } from "../projects";

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
		/** Epsilon's own preference, from `pinned-sessions.json`. */
		pinned: z.boolean(),
	})
	.openapi("SessionSummary");

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** A folder with at least one session, newest activity first. */
const projectSessionsSchema = z
	.object({
		project: projectStatusSchema,
		sessions: z.array(sessionSummarySchema),
	})
	.openapi("ProjectSessions");

/**
 * Every session in the home, split by place. A project appears here once it has a
 * session file; a folder opened but never used lives only in the page's URL.
 */
export const sessionListSchema = z
	.object({
		chats: z.array(sessionSummarySchema),
		projects: z.array(projectSessionsSchema),
		/** Why pins could not be read, when the file exists but is unusable. */
		pinsProblem: z.string().optional(),
	})
	.openapi("SessionList");

export type SessionList = z.infer<typeof sessionListSchema>;

export const moveSessionInputSchema = z
	.object({ project: z.string().min(1) })
	.openapi("MoveSessionInput");

export const movedSessionSchema = z.object({ id: z.string() }).openapi("MovedSession");

export const renameSessionInputSchema = z
	.object({ name: z.string().trim().min(1).max(200) })
	.openapi("RenameSessionInput");

export const renamedSessionSchema = z
	.object({ id: z.string(), name: z.string() })
	.openapi("RenamedSession");

export const removedProjectSchema = z
	.object({ removed: z.number().int().nonnegative() })
	.openapi("RemovedProject");

export const pinSessionInputSchema = z.object({ pinned: z.boolean() }).openapi("PinSessionInput");

/** The refusals a session route can send. Each leaves the file alone. */
const sessionErrorCodeSchema = z.enum([
	"SESSION_NOT_FOUND",
	"SESSION_RUNNING",
	"PROJECT_NOT_TRUSTED",
	"PROJECT_INVALID",
]);

export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;

export const sessionErrorSchema = problemSchema
	.extend({ code: sessionErrorCodeSchema })
	.openapi("SessionError");
