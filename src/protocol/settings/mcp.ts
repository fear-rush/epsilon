import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { McpRefused } from "../errors.ts";

/**
 * Settings → MCP: the two `mcp.json` files as pi resolves them, one server's detail, and
 * what the live engines report.
 *
 * pi reads `<home>/mcp.json` and, for a trusted project, `<project>/.pi/mcp.json`; a
 * project entry defines a server of its own or only overrides its global namesake. Both
 * files are pi's truth, so this group never carries a value Epsilon keeps on the side.
 *
 * A stored secret never travels: `env`, `headers` and `oauth.clientSecret` are reported by
 * name only, and a save with a blank value keeps what the file holds.
 */

/** The file a server lives in: the agent home's, or one project's. */
export const McpScope = Schema.Literals(["global", "project"]);
export type McpScope = typeof McpScope.Type;

export const McpTransport = Schema.Literals(["stdio", "http"]);
export type McpTransport = typeof McpTransport.Type;

/** The `exposure` values pi accepts in `mcp.json`. */
export const McpExposure = Schema.Literals(["codemode", "deferred", "direct", "hidden"]);
export type McpExposure = typeof McpExposure.Type;

/**
 * What `getAllTools()` reports for a tool. pi resolves MCP tools to one of the four file
 * values, but the same field carries `model-only` for other tools, so the live answer can
 * say it rather than lying about a value it saw.
 */
export const McpLiveExposure = Schema.Literals([
	"codemode",
	"deferred",
	"direct",
	"hidden",
	"model-only",
]);
export type McpLiveExposure = typeof McpLiveExposure.Type;

/** What a project entry may set when it only overrides a global server. */
export const McpOverrideKey = Schema.Literals(["enabled", "exposure", "toolExposure"]);
export type McpOverrideKey = typeof McpOverrideKey.Type;

/** How a global server and the project entry of its name relate. */
export const McpRelation = Schema.Literals([
	"replaces-global",
	"replaced-by-project",
	"overridden-by-project",
]);
export type McpRelation = typeof McpRelation.Type;

/** Per-tool exposure rules: a tool name, or a `*` pattern, to an exposure. */
export const McpToolExposure = Schema.Record(Schema.String, McpExposure);
export type McpToolExposure = typeof McpToolExposure.Type;

/** pi's OAuth options, without the secret the browser never receives. */
export const McpOAuthView = Schema.Struct({
	clientId: Schema.optional(Schema.String),
	callbackPort: Schema.optional(Schema.Int),
	callbackUrl: Schema.optional(Schema.String),
	scope: Schema.optional(Schema.String),
	clientName: Schema.optional(Schema.String),
	clientRegistration: Schema.optional(Schema.Literals(["dcr", "cimd"])),
	authServerMetadataUrl: Schema.optional(Schema.String),
});
export type McpOAuthView = typeof McpOAuthView.Type;

/** The same options as the form writes them; a blank `clientSecret` keeps the stored one. */
export const McpOAuthInput = Schema.Struct({
	clientId: Schema.optional(Schema.String),
	clientSecret: Schema.optional(Schema.String),
	callbackPort: Schema.optional(Schema.Int),
	callbackUrl: Schema.optional(Schema.String),
	scope: Schema.optional(Schema.String),
	clientName: Schema.optional(Schema.String),
	clientRegistration: Schema.optional(Schema.Literals(["dcr", "cimd"])),
	authServerMetadataUrl: Schema.optional(Schema.String),
});
export type McpOAuthInput = typeof McpOAuthInput.Type;

/** The hints an MCP server may send with a tool, as pi's `ToolAnnotations` carries them. */
export const McpToolAnnotations = Schema.Struct({
	readOnlyHint: Schema.optional(Schema.Boolean),
	destructiveHint: Schema.optional(Schema.Boolean),
	idempotentHint: Schema.optional(Schema.Boolean),
	openWorldHint: Schema.optional(Schema.Boolean),
});
export type McpToolAnnotations = typeof McpToolAnnotations.Type;

/** What pi said about one server it could not use, from its own attention notice. */
export const McpAttention = Schema.Union([
	Schema.Struct({ kind: Schema.Literal("needs-sign-in") }),
	Schema.Struct({ kind: Schema.Literal("failed"), message: Schema.String }),
]);
export type McpAttention = typeof McpAttention.Type;

/** What every row shows for an entry pi can connect, resolved the way pi reads it. */
const connectable = {
	name: Schema.String,
	/** The command for stdio, the URL for HTTP. */
	target: Schema.String,
	transport: McpTransport,
	/** Its own `enabled`, with a project override applied. */
	enabled: Schema.Boolean,
	description: Schema.optional(Schema.String),
	exposure: Schema.optional(McpExposure),
	/** Whether a tool it exposes needs codemode or `tool_search`. */
	needsIndirect: Schema.Boolean,
	/** Seconds; pi's default is 60. */
	timeout: Schema.optional(Schema.Finite),
} as const;

export const McpServerEntry = Schema.Struct({
	...connectable,
	kind: Schema.Literal("server"),
	scope: McpScope,
	/** The other file's entry of this name, when there is one. */
	relation: Schema.optional(McpRelation),
});
export type McpServerEntry = typeof McpServerEntry.Type;

/** A project entry that only changes keys of the global server of its name. */
export const McpOverrideEntry = Schema.Struct({
	...connectable,
	kind: Schema.Literal("override"),
	scope: Schema.Literal("project"),
	overrideKeys: Schema.Array(McpOverrideKey),
	/** What the override sets `enabled` to, when it sets it. */
	overrideEnabled: Schema.optional(Schema.Boolean),
});
export type McpOverrideEntry = typeof McpOverrideEntry.Type;

/** pi skips this entry. It never connects, but it can be repaired or removed. */
export const McpInvalidEntry = Schema.Struct({
	kind: Schema.Literal("invalid"),
	name: Schema.String,
	scope: McpScope,
	/** pi's reason, in the page's words. */
	problem: Schema.String,
	/** The entry's own `enabled`, so a row still shows Off while pi skips it. */
	enabled: Schema.Boolean,
	/** Set when the entry was meant as an override of a global server. */
	overrideKeys: Schema.optional(Schema.Array(McpOverrideKey)),
});
export type McpInvalidEntry = typeof McpInvalidEntry.Type;

export const McpServerRow = Schema.Union([McpServerEntry, McpOverrideEntry, McpInvalidEntry]);
export type McpServerRow = typeof McpServerRow.Type;

/** The target fields a valid detail and an invalid one share. */
const targetDetail = {
	command: Schema.optional(Schema.String),
	args: Schema.optional(Schema.Array(Schema.String)),
	/** Only the names travel; the values stay in the file. */
	envKeys: Schema.Array(Schema.String),
	cwd: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String),
	headerKeys: Schema.Array(Schema.String),
} as const;

/** The tool options an invalid entry still sets with values pi reads. */
const invalidSettings = {
	transport: Schema.optional(McpTransport),
	description: Schema.optional(Schema.String),
	exposure: Schema.optional(McpExposure),
	timeout: Schema.optional(Schema.Finite),
	toolExposure: Schema.optional(McpToolExposure),
	oauth: Schema.optional(McpOAuthView),
	/** Whether the file holds an `oauth.clientSecret` this page did not receive. */
	oauthClientSecret: Schema.Boolean,
	authProvider: Schema.optional(Schema.String),
} as const;

export const McpServerDetailEntry = Schema.Struct({
	...connectable,
	...targetDetail,
	kind: Schema.Literal("server"),
	scope: McpScope,
	relation: Schema.optional(McpRelation),
	/** The per-tool overrides as written, which the form edits. */
	toolExposure: Schema.optional(McpToolExposure),
	oauth: Schema.optional(McpOAuthView),
	oauthClientSecret: Schema.Boolean,
	/** A `/login` provider whose token the server sends, global file only. */
	authProvider: Schema.optional(Schema.String),
	/** Whether `mcp-auth.json` holds a credential for this server. */
	credentialsStored: Schema.Boolean,
	/** The tail of pi's `mcp.log` for this server, one line per entry. */
	log: Schema.Array(Schema.String),
});
export type McpServerDetailEntry = typeof McpServerDetailEntry.Type;

/** An invalid entry still says what it was meant to be, so the form can repair it. */
export const McpServerDetailInvalid = Schema.Struct({
	...McpInvalidEntry.fields,
	...targetDetail,
	...invalidSettings,
});
export type McpServerDetailInvalid = typeof McpServerDetailInvalid.Type;

export const McpServerDetail = Schema.Union([
	McpServerDetailEntry,
	McpOverrideEntry,
	McpServerDetailInvalid,
]);
export type McpServerDetail = typeof McpServerDetail.Type;

/** A live tool: the name a transcript shows, the rule key, and pi's resolved exposure. */
export const McpLiveTool = Schema.Struct({
	name: Schema.String,
	/** The `toolExposure` key pi matches this tool against; a pattern when the name cannot say. */
	key: Schema.String,
	/** Whether `key` is the server's own name, or a pattern that can match another too. */
	exact: Schema.Boolean,
	exposure: McpLiveExposure,
	annotations: Schema.optional(McpToolAnnotations),
});
export type McpLiveTool = typeof McpLiveTool.Type;

export const McpLiveServer = Schema.Struct({
	name: Schema.String,
	tools: Schema.Array(McpLiveTool),
	/** An extension registered it, so no tools means "no tools yet", not "unknown". */
	registered: Schema.Boolean,
	attention: Schema.optional(McpAttention),
});
export type McpLiveServer = typeof McpLiveServer.Type;

export const McpLive = Schema.Struct({
	/** Live engines that answered. Zero means no session is open in this process. */
	sessions: Schema.Finite,
	servers: Schema.Array(McpLiveServer),
	/**
	 * The resource tools pi registered, by name. They are registered once for the session,
	 * so their presence says resources are reachable but never which server holds them.
	 */
	resourceTools: Schema.Array(Schema.String),
	/** The reaching tools that are active in at least one live engine. */
	codemode: Schema.Boolean,
	toolSearch: Schema.Boolean,
});
export type McpLive = typeof McpLive.Type;

/** What one engine answers to the `mcpLive` query, before the supervisor aggregates it. */
export const McpEngineLive = Schema.Struct({
	active: Schema.Array(Schema.String),
	attention: Schema.Array(
		Schema.Struct({
			name: Schema.String,
			attention: McpAttention,
		}),
	),
	registered: Schema.Array(Schema.String),
	resourceTools: Schema.Array(Schema.String),
	tools: Schema.Array(
		Schema.Struct({
			namespace: Schema.String,
			name: Schema.String,
			exposure: McpLiveExposure,
			annotations: Schema.optional(McpToolAnnotations),
		}),
	),
});
export type McpEngineLive = typeof McpEngineLive.Type;

export const McpListView = Schema.Struct({
	servers: Schema.Array(McpServerRow),
	/** A file pi or Epsilon could not read, so nothing of it is listed. */
	problems: Schema.Array(Schema.String),
});
export type McpListView = typeof McpListView.Type;

/** The transport decides which target exists, so a save cannot name both. */
export const McpServerInput = Schema.Union([
	Schema.Struct({
		scope: McpScope,
		name: Schema.String,
		transport: Schema.Literal("stdio"),
		command: Schema.String,
		args: Schema.optional(Schema.Array(Schema.String)),
		env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		/** Relative paths resolve against the session directory. */
		cwd: Schema.optional(Schema.String),
		description: Schema.optional(Schema.String),
		exposure: Schema.optional(McpExposure),
		toolExposure: Schema.optional(McpToolExposure),
		timeout: Schema.optional(Schema.Finite),
	}),
	Schema.Struct({
		scope: McpScope,
		name: Schema.String,
		transport: Schema.Literal("http"),
		url: Schema.String,
		headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		oauth: Schema.optional(McpOAuthInput),
		/** The `/login` provider whose token is sent; refused in a project file. */
		authProvider: Schema.optional(Schema.String),
		description: Schema.optional(Schema.String),
		exposure: Schema.optional(McpExposure),
		toolExposure: Schema.optional(McpToolExposure),
		timeout: Schema.optional(Schema.Finite),
	}),
]);
export type McpServerInput = typeof McpServerInput.Type;

/** A global server's state in one project: inherit removes the project's override. */
export const McpInProjectValue = Schema.Literals(["inherit", "on", "off"]);
export type McpInProjectValue = typeof McpInProjectValue.Type;

/**
 * A read or write names the server by file and key. `folder` is the project whose
 * `.pi/mcp.json` is read, or null for the home alone.
 */
const serverTarget = {
	folder: Schema.NullOr(Schema.String),
	scope: McpScope,
	name: Schema.String,
} as const;

export const McpRpcs = RpcGroup.make(
	Rpc.make("settings.mcp.list", {
		payload: { folder: Schema.NullOr(Schema.String) },
		success: McpListView,
	}),
	Rpc.make("settings.mcp.live", {
		payload: { folder: Schema.NullOr(Schema.String) },
		success: McpLive,
	}),
	Rpc.make("settings.mcp.read", {
		payload: serverTarget,
		success: McpServerDetail,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.save", {
		payload: { folder: Schema.NullOr(Schema.String), server: McpServerInput },
		success: Schema.Void,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.remove", {
		payload: serverTarget,
		success: Schema.Void,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.setEnabled", {
		payload: { ...serverTarget, enabled: Schema.Boolean },
		success: Schema.Void,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.setInProject", {
		payload: {
			folder: Schema.NullOr(Schema.String),
			name: Schema.String,
			value: McpInProjectValue,
		},
		success: Schema.Void,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.setAutoEnableCodemode", {
		payload: {
			folder: Schema.NullOr(Schema.String),
			scope: McpScope,
			enabled: Schema.Boolean,
		},
		success: Schema.Void,
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.readRaw", {
		payload: serverTarget,
		success: Schema.Struct({ text: Schema.String }),
		error: McpRefused,
	}),
	Rpc.make("settings.mcp.writeRaw", {
		payload: { ...serverTarget, text: Schema.String },
		success: Schema.Void,
		error: McpRefused,
	}),
);
