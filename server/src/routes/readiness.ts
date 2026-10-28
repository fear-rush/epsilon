import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { readinessSchema } from "shared";

import { readReadiness } from "../agent/readiness";
import { config } from "../config";

export const readinessRoute = createRoute({
	method: "get",
	path: "/api/readiness",
	tags: ["meta"],
	operationId: "readiness",
	description: "Whether the agent home holds a usable model, so a turn can run",
	responses: {
		200: {
			description: "What the engine reports for the home it was given",
			content: { "application/json": { schema: readinessSchema } },
		},
	},
});

export const readinessHandler: RouteHandler<typeof readinessRoute> = async (c) =>
	c.json(await readReadiness(config.agentHome), 200);
