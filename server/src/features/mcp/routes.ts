import { OpenAPIHono } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { configWrite, failure, toError } from "../../platform/http";
import {
	autoEnableMcpRoute,
	deleteMcpRoute,
	enabledMcpRoute,
	inProjectMcpRoute,
	readMcpRoute,
	writeMcpRoute,
} from "./contract";
import {
	readMcpServer,
	removeMcpServer,
	setMcpAutoEnableCodemode,
	setMcpServerEnabled,
	setMcpServerInProject,
	writeMcpServer,
} from "./service";

// Registration order is the order of the generated OpenAPI document.
export const mcpRoutes = ({ home, projectDir, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(readMcpRoute, async (c) => {
			const { scope, name } = c.req.valid("param");
			try {
				const detail = await readMcpServer(home, projectDir, scope, name);
				if (detail === undefined) return failure(c, new Error("No such MCP server"), 404);
				return c.json(detail, 200);
			} catch (error) {
				return failure(c, toError(error, "The MCP server did not load"), 400);
			}
		})
		.openapi(writeMcpRoute, (c) =>
			configWrite(c, engines, () => writeMcpServer(home, projectDir, c.req.valid("json"))),
		)
		.openapi(enabledMcpRoute, (c) => {
			const { scope, name, enabled } = c.req.valid("json");
			return configWrite(c, engines, () =>
				setMcpServerEnabled(home, projectDir, scope, name, enabled),
			);
		})
		.openapi(inProjectMcpRoute, (c) =>
			configWrite(c, engines, () => setMcpServerInProject(home, projectDir, c.req.valid("json"))),
		)
		.openapi(autoEnableMcpRoute, (c) =>
			configWrite(c, engines, () =>
				setMcpAutoEnableCodemode(home, projectDir, c.req.valid("json")),
			),
		)
		.openapi(deleteMcpRoute, (c) => {
			const { scope, name } = c.req.valid("param");
			return configWrite(c, engines, () => removeMcpServer(home, projectDir, scope, name));
		});
