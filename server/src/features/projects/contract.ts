/** The project shapes the routes, the session catalog and the settings scope share. */
import { z } from "@hono/zod-openapi";

/**
 * A folder the operator opened. `trusted` is pi's own decision from `trust.json`,
 * honouring a parent folder; nothing runs in a folder until it is true.
 */
export const projectStatusSchema = z
	.object({
		path: z.string(),
		name: z.string(),
		trusted: z.boolean(),
		/** The folder holds a `.pi` or `.agents/skills` that pi loads only once trusted. */
		hasProjectResources: z.boolean(),
	})
	.openapi("ProjectStatus");

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectPathInputSchema = z
	.object({ path: z.string().min(1) })
	.openapi("ProjectPathInput");

/** One level of the folder picker: subfolders only, never file names or contents. */
export const folderListingSchema = z
	.object({
		path: z.string(),
		/** The folder above, or null at the filesystem root. */
		parent: z.string().nullable(),
		folders: z.array(z.object({ name: z.string(), path: z.string() })),
		/** More subfolders exist than the listing carries. */
		truncated: z.boolean(),
	})
	.openapi("FolderListing");

export type FolderListing = z.infer<typeof folderListingSchema>;

export const newFolderInputSchema = z
	.object({ parent: z.string().min(1), name: z.string().trim().min(1).max(255) })
	.openapi("NewFolderInput");

export const createdFolderSchema = z.object({ path: z.string() }).openapi("CreatedFolder");

/** The query every settings route takes: which project's `.pi` sits beside the home. */
export const settingsScopeQuerySchema = z.object({
	project: z
		.string()
		.min(1)
		.optional()
		.openapi({ description: "A trusted project folder. Absent means the agent home alone" }),
});
