/** The MCP routes' documented surface. The handlers are in `routes.ts`. */
import { createRoute } from "@hono/zod-openapi";
import {
	mcpEnabledInputSchema,
	mcpInProjectInputSchema,
	mcpNameSchema,
	mcpScopeSchema,
	mcpServerDetailSchema,
	mcpServerInputSchema,
} from "shared";
import { z } from "zod";

import { errorContent } from "../../platform/http";

const mcpParams = z.object({ scope: mcpScopeSchema, name: mcpNameSchema });

export const readMcpRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/{scope}/{name}",
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
		404: { description: "No server with this name in that file", content: errorContent },
	},
});

export const writeMcpRoute = createRoute({
	method: "post",
	path: "/api/settings/mcp",
	tags: ["settings"],
	operationId: "writeMcpServer",
	description: "Add or change an MCP server in the file its scope names",
	request: {
		body: { required: true, content: { "application/json": { schema: mcpServerInputSchema } } },
	},
	responses: {
		204: { description: "The file now carries the server, and live engines reloaded" },
		400: { description: "The server entry was refused", content: errorContent },
	},
});

export const enabledMcpRoute = createRoute({
	method: "post",
	path: "/api/settings/mcp/enabled",
	tags: ["settings"],
	operationId: "setMcpServerEnabled",
	description:
		"Turn one server on or off in its own file. Off writes `enabled: false`; on removes the key",
	request: {
		body: { required: true, content: { "application/json": { schema: mcpEnabledInputSchema } } },
	},
	responses: {
		204: { description: "The file now carries the state, and live engines reloaded" },
		400: { description: "The change was refused", content: errorContent },
	},
});

export const inProjectMcpRoute = createRoute({
	method: "post",
	path: "/api/settings/mcp/in-project",
	tags: ["settings"],
	operationId: "setMcpServerInProject",
	description:
		"Set a global server's state in this project: inherit the global setting, or write an override",
	request: {
		body: { required: true, content: { "application/json": { schema: mcpInProjectInputSchema } } },
	},
	responses: {
		204: { description: "The project file now carries the override, and live engines reloaded" },
		400: { description: "The change was refused", content: errorContent },
	},
});

export const deleteMcpRoute = createRoute({
	method: "delete",
	path: "/api/settings/mcp/{scope}/{name}",
	tags: ["settings"],
	operationId: "deleteMcpServer",
	description: "Remove an MCP server, or a project override, from its file",
	request: { params: mcpParams },
	responses: {
		204: { description: "The entry is gone from its file" },
		400: { description: "The file could not be written", content: errorContent },
	},
});
