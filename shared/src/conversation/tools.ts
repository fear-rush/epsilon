/**
 * The argument shapes the transcript reads, one schema per renderer. A tool name
 * with no schema is not an error: it renders through the generic fallback.
 *
 * These are pi's tool shapes, kept small on purpose. Anything not listed here is
 * still shown as JSON, so an unknown or extension tool is never blank.
 */
import { z } from "zod";

export const bashArgsSchema = z.looseObject({ command: z.string() });

export const editArgsSchema = z.looseObject({
	path: z.string(),
	edits: z.array(z.looseObject({ oldText: z.string(), newText: z.string() })),
});

export const writeArgsSchema = z.looseObject({ path: z.string(), content: z.string() });

export const readArgsSchema = z.looseObject({ path: z.string() });
