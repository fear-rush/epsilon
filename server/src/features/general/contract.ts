/** The default-model shape the route and the settings snapshot share. */
import { z } from "@hono/zod-openapi";

export const defaultModelSchema = z
	.object({
		provider: z.string(),
		modelId: z.string(),
	})
	.openapi("DefaultModel");

export type DefaultModel = z.infer<typeof defaultModelSchema>;
