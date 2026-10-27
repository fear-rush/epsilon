import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

export const healthRoute = createRoute({
	method: "get",
	path: "/health",
	tags: ["meta"],
	operationId: "health",
	responses: {
		200: {
			description: "Server is running",
			content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
		},
	},
});

export const healthBody = { status: "ok" } as const;
