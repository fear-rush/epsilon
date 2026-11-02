import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import { settingWriteSchema, writeSetting } from "../general";
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

const writeSettingRoute = createRoute({
	method: "patch",
	path: "/api/settings",
	tags: ["settings"],
	operationId: "writeSetting",
	description:
		"Write one setting through pi's own setter, then reload every live engine; keys without a setter are refused here",
	request: {
		body: { required: true, content: { "application/json": { schema: settingWriteSchema } } },
	},
	responses: {
		204: { description: "pi's settings.json now holds this value" },
		400: {
			description: "The panel does not write that key, or the value is not one pi accepts",
			content: errorContent,
		},
	},
});

export const settingsRoutes = ({ home, userHome, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(settingsRoute, async (c) => {
			let folder: string;
			try {
				folder = await settingsFolder(home, c.req.valid("query").project);
			} catch (error) {
				return failure(c, toError(error, "The project cannot be read"), 400);
			}
			return c.json(await readSettings(folder, home, userHome, engines), 200);
		})
		.openapi(writeSettingRoute, (c) => {
			const { key, value } = c.req.valid("json");
			return configWrite(c, engines, () => writeSetting(home, key, value));
		});
