import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { settingsSnapshotSchema } from "./contract";
import { readSettings } from "./snapshot";

const settingsRoute = createRoute({
	method: "get",
	path: "/api/settings",
	tags: ["settings"],
	operationId: "readSettings",
	description: "Providers, default model, MCP servers, skills and packages from the agent home",
	responses: {
		200: {
			description: "The configuration Epsilon runs on",
			content: { "application/json": { schema: settingsSnapshotSchema } },
		},
	},
});

export const settingsRoutes = ({ home, projectDir }: Deps) =>
	new OpenAPIHono().openapi(settingsRoute, async (c) =>
		c.json(await readSettings(projectDir, home), 200),
	);
