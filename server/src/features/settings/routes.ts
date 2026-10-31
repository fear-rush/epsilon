import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { errorContent, failure, toError } from "../../platform/http";
import { settingsFolder, settingsScopeQuerySchema } from "../projects";
import { settingsSnapshotSchema } from "./contract";
import { readSettings } from "./snapshot";

const settingsRoute = createRoute({
	method: "get",
	path: "/api/settings",
	tags: ["settings"],
	operationId: "readSettings",
	description:
		"Providers, default model, MCP servers with what they can reach, skills and packages from the agent home, plus a trusted project's .pi when one is named",
	request: { query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The configuration Epsilon runs on",
			content: { "application/json": { schema: settingsSnapshotSchema } },
		},
		400: { description: "The project is not a trusted folder", content: errorContent },
	},
});

export const settingsRoutes = ({ home, userHome, engines }: Deps) =>
	new OpenAPIHono().openapi(settingsRoute, async (c) => {
		let folder: string;
		try {
			folder = await settingsFolder(home, c.req.valid("query").project);
		} catch (error) {
			return failure(c, toError(error, "The project cannot be read"), 400);
		}
		return c.json(await readSettings(folder, home, userHome, engines), 200);
	});
