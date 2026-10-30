/**
 * The MCP contract: request and response shapes, composed from the shared rules,
 * and the routes' documented surface. The handlers are in `routes.ts`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import {
	mcpExposureSchema,
	mcpNameSchema,
	mcpOverrideKeySchema,
	mcpScopeSchema,
	mcpTransportSchema,
} from "shared";

import { errorContent } from "../../platform/http";

const mcpServerFields = {
	name: mcpNameSchema,
	scope: mcpScopeSchema,
	description: z.string().optional(),
	exposure: mcpExposureSchema.optional(),
	/** Seconds, positive; pi's default is 60. */
	timeout: z.number().positive().optional(),
};

/**
 * A transport decides which target a server needs, so the two are one shape:
 * a stdio server cannot be saved without a command, and an HTTP server cannot be
 * saved without a URL. `enabled` is not here: the panel's switch owns that key,
 * so a save never overwrites a toggle made while the form was open.
 */
const mcpServerInputSchema = z
	.discriminatedUnion("transport", [
		z.object({
			...mcpServerFields,
			transport: z.literal("stdio"),
			/** stdio: one executable, and its arguments as separate entries. */
			command: z.string().min(1),
			args: z.array(z.string()).optional(),
			env: z.record(z.string(), z.string()).optional(),
			/** Relative paths resolve against the session directory. */
			cwd: z.string().optional(),
		}),
		z.object({
			...mcpServerFields,
			transport: z.literal("http"),
			/** http: the streamable HTTP endpoint. */
			url: z.string().min(1),
			headers: z.record(z.string(), z.string()).optional(),
		}),
	])
	.openapi("McpServerInput");

export type McpServerInput = z.infer<typeof mcpServerInputSchema>;

/** The switch on one row, and on one server's page. */
const mcpEnabledInputSchema = z
	.object({
		scope: mcpScopeSchema,
		name: mcpNameSchema,
		enabled: z.boolean(),
	})
	.openapi("McpEnabledInput");

/**
 * A global server's state in this project: `inherit` removes the project's
 * override, `on` and `off` write one. It never touches a project server of the
 * same name.
 */
const mcpInProjectInputSchema = z
	.object({
		name: mcpNameSchema,
		value: z.enum(["inherit", "on", "off"]),
	})
	.openapi("McpInProjectInput");

export type McpInProjectInput = z.infer<typeof mcpInProjectInputSchema>;

export const mcpServerViewSchema = z
	.object({
		name: z.string(),
		scope: mcpScopeSchema,
		/** Absent when the entry is malformed, so nothing says how pi would connect it. */
		transport: mcpTransportSchema.optional(),
		/** The command for stdio, the URL for HTTP. */
		target: z.string(),
		description: z.string().optional(),
		/** Whether the server connects as pi reads it: its own `enabled`, with a project override applied. */
		enabled: z.boolean(),
		exposure: mcpExposureSchema.optional(),
		timeout: z.number().optional(),
		/** Why pi skips this entry. It never connects, but it can be removed. */
		invalid: z.string().optional(),
		/** A project entry that only changes these keys of the global server of its name. */
		overrideKeys: z.array(mcpOverrideKeySchema).optional(),
		/** What that override sets `enabled` to, when it sets it. */
		overrideEnabled: z.boolean().optional(),
		/** This global server is replaced by the project's own entry of the same name. */
		replacedByProject: z.boolean().optional(),
		/** This global server's `enabled`, `exposure` or `toolExposure` is changed by a project override. */
		overriddenByProject: z.boolean().optional(),
		/** This project entry replaces a global server of the same name. */
		replacesGlobal: z.boolean().optional(),
	})
	.openapi("McpServerView");

export type McpServerView = z.infer<typeof mcpServerViewSchema>;

/**
 * One server, editable. The transport still decides which target the write uses;
 * environment and header values have no place here, so only their names travel.
 * The `oauth*`, `authProvider` and `toolExposureKeys` fields are shown read-only:
 * the form keeps them, and the file is where they are edited.
 */
const mcpServerDetailSchema = mcpServerViewSchema
	.extend({
		command: z.string().optional(),
		args: z.array(z.string()).optional(),
		envKeys: z.array(z.string()),
		cwd: z.string().optional(),
		url: z.string().optional(),
		headerKeys: z.array(z.string()),
		/** Names of the `oauth` keys that are set, never their values. */
		oauthKeys: z.array(z.string()),
		authProvider: z.string().optional(),
		toolExposureKeys: z.array(z.string()),
	})
	.openapi("McpServerDetail");

export type McpServerDetail = z.infer<typeof mcpServerDetailSchema>;

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
