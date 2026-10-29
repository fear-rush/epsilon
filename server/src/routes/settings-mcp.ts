import { createRoute } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { mcpServerInputSchema, settingsErrorSchema } from "shared";
import { z } from "zod";

import { config } from "../config";
import { registry } from "../runtime";
import { removeMcpServer, writeMcpServer } from "../settings/mcp";
import { failure } from "./failure";

const errorContent = { "application/json": { schema: settingsErrorSchema } };

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
	request: { params: z.object({ name: z.string().min(1) }) },
	responses: {
		204: { description: "The server is gone from mcp.json" },
		400: { description: "mcp.json could not be written", content: errorContent },
	},
});

export const writeMcpHandler: RouteHandler<typeof writeMcpRoute> = async (c) => {
	try {
		await writeMcpServer(config.agentHome, c.req.valid("json"));
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};

export const deleteMcpHandler: RouteHandler<typeof deleteMcpRoute> = async (c) => {
	try {
		await removeMcpServer(config.agentHome, c.req.valid("param").name);
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, error instanceof Error ? error : new Error("The settings change failed"));
	}
};
