/** The skill shapes the routes and the store share. */
import { skillDescriptionSchema, skillNameSchema } from "shared";
import { z } from "@hono/zod-openapi";

export const skillInputSchema = z
	.object({
		name: skillNameSchema,
		description: skillDescriptionSchema,
		body: z.string(),
	})
	.openapi("SkillInput");

export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillViewSchema = z
	.object({
		name: z.string(),
		description: z.string(),
		path: z.string(),
	})
	.openapi("SkillView");

export type SkillView = z.infer<typeof skillViewSchema>;
