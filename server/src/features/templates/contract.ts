/** The prompt-template and theme shapes the routes and the service share. */
import { z } from "@hono/zod-openapi";

/** pi's two path-list settings this surface edits, named as pi names them. */
export const templateKindSchema = z.enum(["prompts", "themes"]);

export type TemplateKind = z.infer<typeof templateKindSchema>;

/** Which `settings.json` holds the list: the home's, or the project's `.pi`. */
export const settingsScopeSchema = z.enum(["user", "project"]);

/**
 * One template pi resolved. `origin` and `source` are pi's own vocabulary: a
 * package source, `auto` for pi's own folder, `local` for a configured path.
 */
const templateEntrySchema = z.object({
	path: z.string(),
	name: z.string(),
	enabled: z.boolean(),
	origin: z.enum(["top-level", "package"]),
	source: z.string(),
	dir: z.string(),
});

export const templateListSchema = z
	.object({
		/** The scope's `prompts` or `themes` array, exactly as its settings file holds it. */
		paths: z.array(z.string()),
		entries: z.array(templateEntrySchema),
	})
	.openapi("TemplateList");

export type TemplateList = z.infer<typeof templateListSchema>;

/** One path-list write. `path` is one entry as the list shows it, override mark included.
 * Only `prompts` is written; a `themes` write is refused because a theme only changes a
 * terminal. */
export const templatePathInputSchema = z
	.object({
		kind: templateKindSchema,
		scope: settingsScopeSchema,
		path: z.string().min(1),
	})
	.openapi("TemplatePathInput");

export type TemplatePathInput = z.infer<typeof templatePathInputSchema>;
