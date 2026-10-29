import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { mcpNameSchema, mcpServerInputSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { removeMcpServer, writeMcpServer } from "../settings/mcp";
import { errorContent } from "./failure";
import { settingsWrite } from "./write";

const mcpParams = z.object({ name: mcpNameSchema });

export const writeMcpRoute = createRoute({
	method: "post",
	path: "/api/settings/mcp",
	tags: ["settings"],
	operationId: "writeMcpServer",
	description: "Add or change an MCP server in mcp.json",
	request: {
		body: { required: true, content: { "application/json": { schema: mcpServerInputSchema } } },
	},
	responses: {
		204: { description: "mcp.json now carries the server, and live engines reloaded" },
		400: { description: "The server entry was refused", content: errorContent },
	},
});

export const deleteMcpRoute = createRoute({
	method: "delete",
	path: "/api/settings/mcp/{name}",
	tags: ["settings"],
	operationId: "deleteMcpServer",
	request: { params: mcpParams },
	responses: {
		204: { description: "The server is gone from mcp.json" },
		400: { description: "mcp.json could not be written", content: errorContent },
	},
});

export const writeMcpHandler: RouteHandler<typeof writeMcpRoute> = async (c) =>
	settingsWrite(c, () => writeMcpServer(config.agentHome, c.req.valid("json")));

export const deleteMcpHandler: RouteHandler<typeof deleteMcpRoute> = async (c) =>
	settingsWrite(c, () => removeMcpServer(config.agentHome, c.req.valid("param").name));
