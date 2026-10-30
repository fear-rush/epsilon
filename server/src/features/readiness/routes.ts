import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { readinessSchema } from "./contract";
import { readReadiness } from "./service";

const readinessRoute = createRoute({
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

export const readinessRoutes = ({ home }: Deps) =>
	new OpenAPIHono().openapi(readinessRoute, async (c) => c.json(await readReadiness(home), 200));
