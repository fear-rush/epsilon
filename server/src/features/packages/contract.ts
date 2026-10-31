/** The package shapes the routes and the service share. */
import { z } from "@hono/zod-openapi";

/** pi's two package scopes: the home's `settings.json`, or a project's `.pi/settings.json`. */
const packageScopeSchema = z.enum(["user", "project"]);

export type PackageScope = z.infer<typeof packageScopeSchema>;

export const packageSourceSchema = z.object({
	source: z.string().min(1),
	/** Where pi declares it. `project` needs a project; the default is the home. */
	scope: packageScopeSchema.default("user"),
});

export const packageViewSchema = z
	.object({
		source: z.string(),
		scope: packageScopeSchema,
		installedPath: z.string().optional(),
	})
	.openapi("PackageView");

export type PackageView = z.infer<typeof packageViewSchema>;

const resourceSchema = z.object({
	path: z.string(),
	/** The file's name, or the folder of a `SKILL.md`. */
	name: z.string(),
	enabled: z.boolean(),
});

export const packageResourcesSchema = z
	.object({
		extensions: z.array(resourceSchema),
		skills: z.array(resourceSchema),
		prompts: z.array(resourceSchema),
		themes: z.array(resourceSchema),
	})
	.openapi("PackageResources");

export type PackageResources = z.infer<typeof packageResourcesSchema>;
