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
		/** The folder pi recorded for this session is gone; opening needs a new one. */
		cwdMissing: z.boolean(),
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

/** The input a fork needs: the message it copies up to. */
export const forkSessionInputSchema = z
	.object({ entryId: z.string().min(1) })
	.openapi("ForkSessionInput");

/**
 * A copy of a chat, as a new session: a fork at a message or a clone of where the
 * chat is. The page opens the new id, so every copy route answers it.
 */
export const copiedSessionSchema = z.object({ id: z.string() }).openapi("CopiedSession");

/** The two files pi writes a transcript as. */
const exportFormatSchema = z.enum(["html", "jsonl"]).openapi("ExportFormat");

export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportSessionInputSchema = z
	.object({ format: exportFormatSchema })
	.openapi("ExportSessionInput");

/**
 * One finished export: the bytes pi wrote to a scratch file, with the name and type
 * the browser saves them under. Nothing stays on the server.
 */
export const exportedSessionSchema = z
	.object({ filename: z.string(), mimeType: z.string(), text: z.string() })
	.openapi("ExportedSession");

export type ExportedSession = z.infer<typeof exportedSessionSchema>;

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
	/** pi refused to write the export; its own sentence says why. */
	"EXPORT_FAILED",
	/**
	 * pi, or the file, refused the copy: an entry a fork cannot start from, or a chat
	 * with no file yet. pi's own sentence says which.
	 */
	"SESSION_COPY_FAILED",
]);

export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;

export const sessionErrorSchema = problemSchema
	.extend({ code: sessionErrorCodeSchema })
	.openapi("SessionError");
