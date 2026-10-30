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

/** The key under `mcpServers`, and the URL segment. */
export const mcpNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, dashes and underscores");

const mcpServerFields = {
	name: mcpNameSchema,
	description: z.string().optional(),
	enabled: z.boolean().optional(),
};

/**
 * A transport decides which target a server needs, so the two are one shape:
 * a stdio server cannot be saved without a command, and an HTTP server cannot be
 * saved without a URL.
 */
export const mcpServerInputSchema = z.discriminatedUnion("transport", [
	z.object({
		...mcpServerFields,
		transport: z.literal("stdio"),
		/** stdio: one executable, and its arguments as separate entries. */
		command: z.string().min(1),
		args: z.array(z.string()).optional(),
		env: z.record(z.string(), z.string()).optional(),
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

export const mcpServerViewSchema = z.object({
	name: z.string(),
	transport: mcpTransportSchema,
	/** The command for stdio, the URL for HTTP. */
	target: z.string(),
	description: z.string().optional(),
	enabled: z.boolean(),
});

export type McpServerView = z.infer<typeof mcpServerViewSchema>;

/**
 * One server, editable. The transport still decides which target the write uses;
 * environment and header values have no place here, so only their names travel.
 */
export const mcpServerDetailSchema = mcpServerViewSchema.extend({
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	envKeys: z.array(z.string()),
	url: z.string().optional(),
	headerKeys: z.array(z.string()),
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
	skills: z.array(skillViewSchema),
	packages: z.array(packageViewSchema),
	ready: z.boolean(),
	/** What pi's model runtime could not compose, such as an invalid provider entry. */
	error: z.string().optional(),
});

export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
