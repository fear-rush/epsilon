import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { mcpNameSchema, mcpServerDetailSchema, mcpServerInputSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { readMcpServer, removeMcpServer, writeMcpServer } from "../settings/mcp";
import { errorContent, failure, toError } from "./failure";
import { settingsWrite } from "./write";

const mcpParams = z.object({ name: mcpNameSchema });

export const readMcpRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/{name}",
	tags: ["settings"],
	operationId: "readMcpServer",
	description:
		"The editable detail of one MCP server, with variable and header names but no values",
	request: { params: mcpParams },
	responses: {
		200: {
			description: "The server entry, its target and the names of its stored values",
			content: { "application/json": { schema: mcpServerDetailSchema } },
		},
		400: { description: "mcp.json could not be read", content: errorContent },
		404: { description: "No server with this name in mcp.json", content: errorContent },
	},
});

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

export const readMcpHandler: RouteHandler<typeof readMcpRoute> = async (c) => {
	try {
		const detail = await readMcpServer(config.agentHome, c.req.valid("param").name);
		if (detail === undefined) return failure(c, new Error("No such MCP server"), 404);
		return c.json(detail, 200);
	} catch (error) {
		return failure(c, toError(error, "The MCP server did not load"), 400);
	}
};

export const writeMcpHandler: RouteHandler<typeof writeMcpRoute> = async (c) =>
	settingsWrite(c, () => writeMcpServer(config.agentHome, c.req.valid("json")));

export const deleteMcpHandler: RouteHandler<typeof deleteMcpRoute> = async (c) =>
	settingsWrite(c, () => removeMcpServer(config.agentHome, c.req.valid("param").name));
