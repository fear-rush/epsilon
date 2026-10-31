/**
 * The MCP contract: request and response shapes, composed from the shared rules,
 * and the routes' documented surface. The handlers are in `routes.ts`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import {
	mcpExposureSchema,
	mcpNameSchema,
	mcpOAuthClientRegistrationSchema,
	mcpOverrideKeySchema,
	mcpRelationSchema,
	mcpScopeSchema,
	mcpToolExposureSchema,
	mcpTransportSchema,
} from "shared";

import { errorContent } from "../../platform/http";
import { settingsScopeQuerySchema } from "../projects";

const mcpServerFields = {
	name: mcpNameSchema,
	scope: mcpScopeSchema,
	description: z.string().optional(),
	exposure: mcpExposureSchema.optional(),
	/** Per-tool overrides: a tool name or `*` pattern, to an exposure. */
	toolExposure: mcpToolExposureSchema.optional(),
	/** Seconds, positive; pi's default is 60. */
	timeout: z.number().positive().optional(),
};

/**
 * The OAuth options pi resolves before it connects. `clientSecret` is a secret
 * like an environment value: a blank one keeps what the file holds.
 */
const mcpOAuthInputSchema = z
	.object({
		clientId: z.string().optional(),
		clientSecret: z.string().optional(),
		callbackPort: z.number().int().optional(),
		callbackUrl: z.string().optional(),
		scope: z.string().optional(),
		clientName: z.string().optional(),
		clientRegistration: mcpOAuthClientRegistrationSchema.optional(),
		authServerMetadataUrl: z.string().optional(),
	})
	.openapi("McpOAuthInput");

/**
 * The same options without the secret, which the browser never sees. `oauth`
 * carries one of these and `oauthClientSecret` says whether one is stored.
 */
const mcpOAuthViewSchema = z
	.object({
		clientId: z.string().optional(),
		callbackPort: z.number().int().optional(),
		callbackUrl: z.string().optional(),
		scope: z.string().optional(),
		clientName: z.string().optional(),
		clientRegistration: mcpOAuthClientRegistrationSchema.optional(),
		authServerMetadataUrl: z.string().optional(),
	})
	.openapi("McpOAuth");

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
			oauth: mcpOAuthInputSchema.optional(),
			/** A `/login` provider whose token is sent instead of using OAuth. Global only. */
			authProvider: z.string().optional(),
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

/**
 * The file-level switch that decides whether a connecting `codemode` server
 * activates the codemode tool. `true` is pi's default, so it removes the key.
 */
const mcpAutoEnableInputSchema = z
	.object({
		scope: mcpScopeSchema,
		enabled: z.boolean(),
	})
	.openapi("McpAutoEnableInput");

export type McpAutoEnableInput = z.infer<typeof mcpAutoEnableInputSchema>;

/** What every row shows for an entry pi can connect, resolved the way pi reads it. */
const mcpConnectableFields = {
	name: z.string(),
	/** The command for stdio, the URL for HTTP. */
	target: z.string(),
	transport: mcpTransportSchema,
	description: z.string().optional(),
	/** Whether the server connects as pi reads it: its own `enabled`, with a project override applied. */
	enabled: z.boolean(),
	exposure: mcpExposureSchema.optional(),
	/** Whether any of its tools needs codemode or `tool_search`, which are not always active. */
	needsIndirect: z.boolean(),
	timeout: z.number().optional(),
};

const mcpServerEntrySchema = z
	.object({
		kind: z.literal("server"),
		scope: mcpScopeSchema,
		...mcpConnectableFields,
		/** The other file's entry of this name, when there is one. */
		relation: mcpRelationSchema.optional(),
	})
	.openapi("McpServerEntry");

/** A project entry that only changes keys of the global server of its name. */
const mcpOverrideEntrySchema = z
	.object({
		kind: z.literal("override"),
		scope: z.literal("project"),
		...mcpConnectableFields,
		overrideKeys: z.array(mcpOverrideKeySchema),
		/** What the override sets `enabled` to, when it sets it. */
		overrideEnabled: z.boolean().optional(),
	})
	.openapi("McpOverrideEntry");

/** pi skips this entry. It never connects, but it can be removed. */
const mcpInvalidEntrySchema = z
	.object({
		kind: z.literal("invalid"),
		name: z.string(),
		scope: mcpScopeSchema,
		problem: z.string(),
		/** The entry's own `enabled`, so a row still shows Off while pi skips it. */
		enabled: z.boolean(),
		/** Set when the entry was meant as an override of a global server. */
		overrideKeys: z.array(mcpOverrideKeySchema).optional(),
	})
	.openapi("McpInvalidEntry");

export const mcpServerViewSchema = z
	.discriminatedUnion("kind", [mcpServerEntrySchema, mcpOverrideEntrySchema, mcpInvalidEntrySchema])
	.openapi("McpServerView");

export type McpServerView = z.infer<typeof mcpServerViewSchema>;

/**
 * The target fields a server detail and an invalid detail share. An invalid entry
 * has no `url`/`command` of its own, but what pi can still read of the raw object
 * is a repair hint: without it the form would start from the name alone.
 */
const mcpTargetDetailFields = {
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	envKeys: z.array(z.string()),
	cwd: z.string().optional(),
	url: z.string().optional(),
	headerKeys: z.array(z.string()),
};

const mcpServerEntryDetailSchema = mcpServerEntrySchema
	.extend({
		...mcpTargetDetailFields,
		/** The per-tool overrides as written, which the form edits. */
		toolExposure: mcpToolExposureSchema.optional(),
		/** OAuth options with no secret in them. */
		oauth: mcpOAuthViewSchema.optional(),
		/** Whether the file holds an `oauth.clientSecret` this page did not receive. */
		oauthClientSecret: z.boolean(),
		authProvider: z.string().optional(),
		/** Whether `mcp-auth.json` holds a credential for this server. */
		credentialsStored: z.boolean(),
		/** The tail of pi's `mcp.log` for this server, one line per entry. */
		log: z.array(z.string()),
	})
	.openapi("McpServerEntryDetail");

/**
 * An invalid entry still says what it was meant to be, so the form can repair it.
 * `toolExposure` and `oauth` travel only when pi would accept them, so a repair
 * keeps the credentials of an entry that broke for another reason and drops the
 * key that broke it.
 */
const mcpInvalidEntryDetailSchema = mcpInvalidEntrySchema
	.extend({
		...mcpTargetDetailFields,
		/** The transport the raw target implies, so a repair starts from the right one. */
		transport: mcpTransportSchema.optional(),
		description: z.string().optional(),
		/** The tool options pi would still accept, so a repair keeps them. */
		exposure: mcpExposureSchema.optional(),
		timeout: z.number().optional(),
		toolExposure: mcpToolExposureSchema.optional(),
		oauth: mcpOAuthViewSchema.optional(),
		oauthClientSecret: z.boolean(),
		authProvider: z.string().optional(),
	})
	.openapi("McpInvalidEntryDetail");

const mcpServerDetailSchema = z
	.discriminatedUnion("kind", [
		mcpServerEntryDetailSchema,
		mcpOverrideEntrySchema,
		mcpInvalidEntryDetailSchema,
	])
	.openapi("McpServerDetail");

export type McpServerDetail = z.infer<typeof mcpServerDetailSchema>;

/**
 * Whether the configured servers can be reached at all: pi activates `codemode`
 * for a `codemode` server only while `autoEnableCodemode` is on, and `tool_search`
 * for a `deferred` one. Everything here is read from the files, so it says what
 * the next session will do.
 */
const mcpUnreachableSchema = z
	.object({
		name: z.string(),
		/** The exposures of this server that need codemode or tool_search. */
		exposures: z.array(mcpExposureSchema),
	})
	.openapi("McpUnreachable");

export const mcpReachSchema = z
	.object({
		/** `autoEnableCodemode` as written per file; absent means pi's default of true. */
		autoEnableCodemode: z.object({
			global: z.boolean().optional(),
			project: z.boolean().optional(),
		}),
		/** Whether `defaultTools` in `settings.json` already names codemode. */
		codemodeDefault: z.boolean(),
		/** `settings.json` disables the built-in that reaches these tools. */
		codemodeDisabled: z.boolean(),
		toolSearchDisabled: z.boolean(),
		/** Enabled servers nothing can reach, with the exposures that need a reaching tool. */
		unreachable: z.array(mcpUnreachableSchema),
	})
	.openapi("McpReach");

export type McpReach = z.infer<typeof mcpReachSchema>;

/**
 * What the live engines report. pi exposes no connection state, only the tools a
 * server registered once it connected, so this cannot tell failed from
 * needs-sign-in from still-connecting; the panel says which one it means.
 */
export const mcpLiveSchema = z
	.object({
		/** Live engines that answered. Zero means no session is open in this process. */
		sessions: z.number().int(),
		/** Servers with at least one registered tool, how many, and the names pi registered them under. */
		servers: z.array(
			z.object({
				name: z.string(),
				tools: z.number().int(),
				/** The server's own tool names, as far as the registered name lets them be recovered. */
				toolNames: z.array(z.string()),
			}),
		),
		/** The reaching tools that are active in at least one live engine. */
		codemode: z.boolean(),
		toolSearch: z.boolean(),
	})
	.openapi("McpLive");

export type McpLive = z.infer<typeof mcpLiveSchema>;

const mcpParams = z.object({ scope: mcpScopeSchema, name: mcpNameSchema });

export const readMcpRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/{scope}/{name}",
	tags: ["settings"],
	operationId: "readMcpServer",
	description:
		"The editable detail of one MCP server, with variable, header and secret names but no values, plus its log tail",
	request: { params: mcpParams, query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The server entry, its target, the names of its stored values and its log",
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
	description:
		"Add or change an MCP server in the file its scope names. A save pi would skip is refused",
	request: {
		query: settingsScopeQuerySchema,
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
		query: settingsScopeQuerySchema,
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
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: mcpInProjectInputSchema } } },
	},
	responses: {
		204: { description: "The project file now carries the override, and live engines reloaded" },
		400: { description: "The change was refused", content: errorContent },
	},
});

export const autoEnableMcpRoute = createRoute({
	method: "post",
	path: "/api/settings/mcp/auto-enable-codemode",
	tags: ["settings"],
	operationId: "setMcpAutoEnableCodemode",
	description:
		"Let a connecting codemode server activate codemode in its file. On removes the key, which is pi's default",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: mcpAutoEnableInputSchema } } },
	},
	responses: {
		204: { description: "The file now carries the setting, and live engines reloaded" },
		400: { description: "The change was refused", content: errorContent },
	},
});

export const deleteMcpRoute = createRoute({
	method: "delete",
	path: "/api/settings/mcp/{scope}/{name}",
	tags: ["settings"],
	operationId: "deleteMcpServer",
	description: "Remove an MCP server, or a project override, from its file",
	request: { params: mcpParams, query: settingsScopeQuerySchema },
	responses: {
		204: { description: "The entry is gone from its file" },
		400: { description: "The file could not be written", content: errorContent },
	},
});

const mcpRawSchema = z.object({ text: z.string() }).openapi("McpRaw");

export const readMcpRawRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/{scope}/{name}/raw",
	tags: ["settings"],
	operationId: "readMcpRaw",
	description:
		"One server's entry in its mcp.json as JSON text. Stored env, header and OAuth secret values are replaced by the text <stored>",
	request: { params: mcpParams, query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The entry as JSON text",
			content: { "application/json": { schema: mcpRawSchema } },
		},
		400: { description: "mcp.json could not be read", content: errorContent },
		404: { description: "No server with this name in that file", content: errorContent },
	},
});

export const writeMcpRawRoute = createRoute({
	method: "put",
	path: "/api/settings/mcp/{scope}/{name}/raw",
	tags: ["settings"],
	operationId: "writeMcpRaw",
	description:
		"Replace one server's entry from JSON text. Each <stored> value keeps what the file holds at that path; nothing else in the file changes",
	request: {
		params: mcpParams,
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: mcpRawSchema } } },
	},
	responses: {
		204: { description: "The file now carries the entry, and live engines reloaded" },
		400: { description: "The text was refused and nothing was written", content: errorContent },
	},
});
