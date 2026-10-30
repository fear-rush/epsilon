import { z } from "zod";

import { snapshotModelSchema } from "../protocol/frames";

import { builtinProviderSchema, providerViewSchema } from "./providers";

export * from "./providers";

/**
 * The dashboard configuration contract. The server writes pi's documented files
 * and calls pi's SDK where it exposes a writer; the browser only ever sees this
 * shape (docs/adr/0012-configure-in-the-dashboard.md).
 */

export const defaultModelSchema = z.object({
	provider: z.string(),
	modelId: z.string(),
});

export type DefaultModel = z.infer<typeof defaultModelSchema>;

export const mcpTransportSchema = z.enum(["stdio", "http"]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

/** The file a server lives in: `<agent home>/mcp.json` or `<project>/.pi/mcp.json`. */
export const mcpScopeSchema = z.enum(["global", "project"]);

export type McpScope = z.infer<typeof mcpScopeSchema>;

/** How a server's tools reach the model (pi's `exposure`). */
export const mcpExposureSchema = z.enum(["codemode", "deferred", "direct", "hidden"]);

export type McpExposure = z.infer<typeof mcpExposureSchema>;

/** What a project entry may change of the global server of its name. */
export const mcpOverrideKeySchema = z.enum(["enabled", "exposure", "toolExposure"]);

export type McpOverrideKey = z.infer<typeof mcpOverrideKeySchema>;

/** The key under `mcpServers`, and the URL segment. */
export const mcpNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, dashes and underscores");

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
export const mcpServerInputSchema = z.discriminatedUnion("transport", [
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
]);

export type McpServerInput = z.infer<typeof mcpServerInputSchema>;

/** The switch on one row, and on one server's page. */
export const mcpEnabledInputSchema = z.object({
	scope: mcpScopeSchema,
	name: mcpNameSchema,
	enabled: z.boolean(),
});

export type McpEnabledInput = z.infer<typeof mcpEnabledInputSchema>;

/**
 * A global server's state in this project: `inherit` removes the project's
 * override, `on` and `off` write one. It never touches a project server of the
 * same name.
 */
export const mcpInProjectInputSchema = z.object({
	name: mcpNameSchema,
	value: z.enum(["inherit", "on", "off"]),
});

export type McpInProjectInput = z.infer<typeof mcpInProjectInputSchema>;

export const mcpServerViewSchema = z.object({
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
});

export type McpServerView = z.infer<typeof mcpServerViewSchema>;

/**
 * One server, editable. The transport still decides which target the write uses;
 * environment and header values have no place here, so only their names travel.
 * The `oauth*`, `authProvider` and `toolExposureKeys` fields are shown read-only:
 * the form keeps them, and the file is where they are edited.
 */
export const mcpServerDetailSchema = mcpServerViewSchema.extend({
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
});

export type McpServerDetail = z.infer<typeof mcpServerDetailSchema>;

/** The directory name under `<agent home>/skills`, and the URL segment. */
export const skillNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, digits, dashes and underscores");

export const skillInputSchema = z.object({
	name: skillNameSchema,
	description: z.string().min(1),
	body: z.string(),
});

export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillViewSchema = z.object({
	name: z.string(),
	description: z.string(),
	path: z.string(),
});

export type SkillView = z.infer<typeof skillViewSchema>;

export const packageViewSchema = z.object({
	source: z.string(),
	scope: z.enum(["user", "project"]),
	installedPath: z.string().optional(),
});

export type PackageView = z.infer<typeof packageViewSchema>;

export const settingsSnapshotSchema = z.object({
	home: z.string(),
	defaultModel: defaultModelSchema.nullable(),
	/** Providers with an entry or a credential. The full registry is in builtins. */
	providers: z.array(providerViewSchema),
	/** Every provider pi ships, for the add picker. */
	builtins: z.array(builtinProviderSchema),
	/** Every model the engine accepts, for the default-model picker. */
	models: z.array(snapshotModelSchema),
	mcp: z.array(mcpServerViewSchema),
	/** `settings.json` lists `-builtin:mcp`, so no session connects a configured server. */
	mcpDisabled: z.boolean(),
	/** The folder this deployment runs in, and therefore the project `mcp.json` it reads. */
	projectDir: z.string(),
	skills: z.array(skillViewSchema),
	packages: z.array(packageViewSchema),
	ready: z.boolean(),
	/** What pi's model runtime could not compose, such as an invalid provider entry. */
	error: z.string().optional(),
});

export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
