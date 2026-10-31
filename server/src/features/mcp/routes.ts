import { OpenAPIHono } from "@hono/zod-openapi";
import type { McpScope } from "shared";

import type { Deps } from "../../deps";
import type { AgentHome } from "../../platform/agent-home";
import { configWrite, failure, toError } from "../../platform/http";
import { settingsFolder } from "../projects";
import {
	autoEnableMcpRoute,
	deleteMcpRoute,
	enabledMcpRoute,
	inProjectMcpRoute,
	readMcpRawRoute,
	readMcpRoute,
	writeMcpRawRoute,
	writeMcpRoute,
} from "./contract";
import { readMcpRaw, writeMcpRaw } from "./raw";
import {
	readMcpServer,
	removeMcpServer,
	setMcpAutoEnableCodemode,
	setMcpServerEnabled,
	setMcpServerInProject,
	writeMcpServer,
} from "./service";

/**
 * The folder whose `.pi/mcp.json` is the project file. A project-scoped change
 * needs a project: without one the folder is the chats folder, and a write there
 * would give every chat a project file.
 */
const folderFor = (home: AgentHome, project: string | undefined, scope: McpScope) => {
	if (scope === "project" && project === undefined) {
		throw new Error("Pick a project to change its .pi/mcp.json");
	}
	return settingsFolder(home, project);
};

// Registration order is the order of the generated OpenAPI document.
export const mcpRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono()
		.openapi(readMcpRoute, async (c) => {
			const { scope, name } = c.req.valid("param");
			try {
				const folder = await folderFor(home, c.req.valid("query").project, scope);
				const detail = await readMcpServer(home, folder, scope, name);
				if (detail === undefined) return failure(c, new Error("No such MCP server"), 404);
				return c.json(detail, 200);
			} catch (error) {
				return failure(c, toError(error, "The MCP server did not load"), 400);
			}
		})
		.openapi(readMcpRawRoute, async (c) => {
			const { scope, name } = c.req.valid("param");
			try {
				const folder = await folderFor(home, c.req.valid("query").project, scope);
				const text = await readMcpRaw(home, folder, scope, name);
				if (text === undefined) return failure(c, new Error("No such MCP server"), 404);
				return c.json({ text }, 200);
			} catch (error) {
				return failure(c, toError(error, "The MCP server did not load"), 400);
			}
		})
		.openapi(writeMcpRawRoute, (c) => {
			const { scope, name } = c.req.valid("param");
			const { text } = c.req.valid("json");
			return configWrite(c, engines, async () =>
				writeMcpRaw(
					home,
					await folderFor(home, c.req.valid("query").project, scope),
					scope,
					name,
					text,
				),
			);
		})
		.openapi(writeMcpRoute, (c) => {
			const input = c.req.valid("json");
			return configWrite(c, engines, async () =>
				writeMcpServer(
					home,
					await folderFor(home, c.req.valid("query").project, input.scope),
					input,
				),
			);
		})
		.openapi(enabledMcpRoute, (c) => {
			const { scope, name, enabled } = c.req.valid("json");
			return configWrite(c, engines, async () =>
				setMcpServerEnabled(
					home,
					await folderFor(home, c.req.valid("query").project, scope),
					scope,
					name,
					enabled,
				),
			);
		})
		.openapi(inProjectMcpRoute, (c) =>
			configWrite(c, engines, async () =>
				setMcpServerInProject(
					home,
					await folderFor(home, c.req.valid("query").project, "project"),
					c.req.valid("json"),
				),
			),
		)
		.openapi(autoEnableMcpRoute, (c) => {
			const input = c.req.valid("json");
			return configWrite(c, engines, async () =>
				setMcpAutoEnableCodemode(
					home,
					await folderFor(home, c.req.valid("query").project, input.scope),
					input,
				),
			);
		})
		.openapi(deleteMcpRoute, (c) => {
			const { scope, name } = c.req.valid("param");
			return configWrite(c, engines, async () =>
				removeMcpServer(
					home,
					await folderFor(home, c.req.valid("query").project, scope),
					scope,
					name,
				),
			);
		});
