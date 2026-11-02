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
		/** True when the settings entry is an object with filters or `autoload`, not a bare source. */
		filtered: z.boolean(),
		/** Which declaration wins when both scopes name the same package. */
		relation: z.enum(["own", "overrides", "inherited"]),
	})
	.openapi("PackageView");

export type PackageView = z.infer<typeof packageViewSchema>;

const resourceSchema = z.object({
	path: z.string(),
	/** The file's name, or the folder of a `SKILL.md`. */
	name: z.string(),
	enabled: z.boolean(),
});

/** The four resource kinds pi's package filter names. */
const packageResourceTypeSchema = z.enum(["extensions", "skills", "prompts", "themes"]);

/**
 * One switch on one package resource. The path is checked against what pi resolved
 * for that package, so the panel cannot write a filter for a file that is not there.
 */
export const packageResourceInputSchema = z
	.object({
		source: z.string().min(1),
		scope: packageScopeSchema,
		type: packageResourceTypeSchema,
		path: z.string().min(1),
		enabled: z.boolean(),
	})
	.openapi("PackageResourceInput");

export type PackageResourceInput = z.infer<typeof packageResourceInputSchema>;

export const packageResourcesSchema = z
	.object({
		extensions: z.array(resourceSchema),
		skills: z.array(resourceSchema),
		prompts: z.array(resourceSchema),
		themes: z.array(resourceSchema),
	})
	.openapi("PackageResources");

export type PackageResources = z.infer<typeof packageResourcesSchema>;

/** One package pi reports a newer version for. Local and pinned sources are never checked. */
const packageUpdateSchema = z
	.object({
		source: z.string(),
		scope: packageScopeSchema,
		/** Which updater pi would run. */
		type: z.enum(["npm", "git"]),
	})
	.openapi("PackageUpdate");

export type PackageUpdate = z.infer<typeof packageUpdateSchema>;

export const packageUpdateListSchema = z
	.object({ updates: z.array(packageUpdateSchema) })
	.openapi("PackageUpdateList");
