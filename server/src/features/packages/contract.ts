/** The package shapes the routes and the service share. */
import { z } from "@hono/zod-openapi";

export const packageSourceSchema = z.object({ source: z.string().min(1) });

export const packageViewSchema = z
	.object({
		source: z.string(),
		scope: z.enum(["user", "project"]),
		installedPath: z.string().optional(),
	})
	.openapi("PackageView");

export type PackageView = z.infer<typeof packageViewSchema>;
