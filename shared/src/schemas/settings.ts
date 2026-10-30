import { z } from "zod";

import { snapshotModelSchema, thinkingLevelSchema } from "../protocol/frames";

/**
 * The dashboard configuration contract. The server writes pi's documented files
 * and calls pi's SDK where it exposes a writer; the browser only ever sees this
 * shape (docs/adr/0012-configure-in-the-dashboard.md).
 */

/** The API families `models.json` accepts for a provider. */
export const providerApiSchema = z.enum([
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
]);

export type ProviderApi = z.infer<typeof providerApiSchema>;

/** Which pi thinking levels a model offers, and the value each one sends. */
export const thinkingLevelMapSchema = z.partialRecord(
	thinkingLevelSchema,
	z.union([z.string().min(1), z.null()]),
);

export type ThinkingLevelMap = z.infer<typeof thinkingLevelMapSchema>;

/**
 * The compatibility fields that decide how a reasoning level travels. Empty
 * means pi auto-detects; other compat keys are preserved by the writers.
 */
export const reasoningCompatSchema = z.looseObject({
	thinkingFormat: z
		.enum([
			"openai",
			"openrouter",
			"deepseek",
			"together",
			"baseten",
			"zai",
			"qwen",
			"chat-template",
			"qwen-chat-template",
			"string-thinking",
			"ant-ling",
		])
		.optional(),
	supportsReasoningEffort: z.boolean().optional(),
	thinkingTokenBudgetField: z
		.enum(["thinking_token_budget", "thinking_budget", "thinking_budget_tokens"])
		.optional(),
	requiresReasoningContentOnAssistantMessages: z.boolean().optional(),
	forceAdaptiveThinking: z.boolean().optional(),
});

export type ReasoningCompat = z.infer<typeof reasoningCompatSchema>;

export const providerModelCostSchema = z.object({
	input: z.number(),
	output: z.number(),
	cacheRead: z.number(),
	cacheWrite: z.number(),
});

export type ProviderModelCost = z.infer<typeof providerModelCostSchema>;

/** One model entry the panel edits. Unset fields keep pi's defaults. */
export const providerModelInputSchema = z.object({
	/** The id sent to the API. */
	id: z.string().min(1),
	name: z.string().optional(),
	/** Per-model override; the provider's API applies when unset. */
	api: providerApiSchema.optional(),
	baseUrl: z.url().optional(),
	reasoning: z.boolean().optional(),
	thinkingLevelMap: thinkingLevelMapSchema.optional(),
	compat: reasoningCompatSchema.optional(),
	input: z.array(z.enum(["text", "image"])).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxTokens: z.number().int().positive().optional(),
	cost: providerModelCostSchema.optional(),
});

export type ProviderModelInput = z.infer<typeof providerModelInputSchema>;

/** `modelOverrides` changes fields of a model pi ships, without replacing it. */
export const modelOverrideSchema = providerModelInputSchema.omit({ id: true });

export type ModelOverride = z.infer<typeof modelOverrideSchema>;

/** The provider key under `providers` in models.json, and the URL segment. */
export const providerIdSchema = z
	.string()
	.min(1)
	// `new` is the add-provider page, so it cannot also name a provider.
	.regex(
		/^(?!new$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
		'Use letters, digits, dashes and underscores; "new" is reserved',
	);

export const providerInputSchema = z.object({
	/** Also the key under `providers` in models.json. */
	id: providerIdSchema,
	name: z.string().optional(),
	/**
	 * A provider field is partial: omitting it keeps the stored value and an empty
	 * string clears it. The form sends what it shows. A set value must be a URL the
	 * engine can call.
	 */
	baseUrl: z.union([z.literal(""), z.url()]).optional(),
	/** Empty clears the stored family; omitting it keeps the stored one. */
	api: z.union([z.literal(""), providerApiSchema]).optional(),
	/**
	 * Empty means "keep the stored value". A literal key is written to the
	 * documented `apiKey` field; `$NAME` and `!command` work as pi documents them.
	 */
	apiKey: z.string().optional(),
	/**
	 * An empty value for a key keeps the stored value. A key omitted from the
	 * record is removed. Headers never travel back to the browser.
	 */
	headers: z.record(z.string(), z.string()).optional(),
	/** Provider-wide reasoning format; a model's compat overrides it per key. */
	compat: reasoningCompatSchema.optional(),
	/** Omit for a built-in provider whose catalog must stay in place. */
	models: z.array(providerModelInputSchema).optional(),
	modelOverrides: z.record(z.string(), modelOverrideSchema).optional(),
});

export type ProviderInput = z.infer<typeof providerInputSchema>;

export const providerViewSchema = z.object({
	id: z.string(),
	name: z.string(),
	baseUrl: z.string().optional(),
	api: providerApiSchema.optional(),
	modelCount: z.number().int().nonnegative(),
	configured: z.boolean(),
	/** Where the credential came from: stored, environment, models.json, ... */
	source: z.string().optional(),
	/** A literal key in models.json. The key itself never leaves the server. */
	hasKey: z.boolean(),
	/** True when models.json has an entry for this id. */
	custom: z.boolean(),
	/** True when pi ships this provider id. */
	builtin: z.boolean(),
});

export type ProviderView = z.infer<typeof providerViewSchema>;

const providerStoredSchema = z.object({
	name: z.string().optional(),
	baseUrl: z.string().optional(),
	api: providerApiSchema.optional(),
	compat: reasoningCompatSchema.optional(),
});

export const providerDetailSchema = z.object({
	id: z.string(),
	/** The effective name, from models.json or pi. */
	name: z.string(),
	/** The effective base URL, from models.json or pi. */
	baseUrl: z.string().optional(),
	/** The effective API family, from models.json only. */
	api: providerApiSchema.optional(),
	/** What models.json actually stores, so the form does not pin inherited values. */
	stored: providerStoredSchema,
	builtin: z.boolean(),
	custom: z.boolean(),
	configured: z.boolean(),
	source: z.string().optional(),
	hasKey: z.boolean(),
	/** Header names only. Values stay on the server. */
	headerKeys: z.array(z.string()),
	/** Models declared in models.json, which replace a built-in catalog. */
	models: z.array(providerModelInputSchema),
	modelOverrides: z.record(z.string(), modelOverrideSchema),
	/** Every model the runtime exposes right now, for the left list. */
	catalog: z.array(snapshotModelSchema),
});

export type ProviderDetail = z.infer<typeof providerDetailSchema>;

export const builtinProviderSchema = z.object({
	id: z.string(),
	name: z.string(),
	/** Already has a models.json entry or a stored credential. */
	configured: z.boolean(),
});

export type BuiltinProvider = z.infer<typeof builtinProviderSchema>;

export const providerImportInputSchema = z.object({
	/** Reuses the stored credential when apiKey is empty. */
	providerId: z.string().optional(),
	baseUrl: z.url(),
	api: providerApiSchema,
	apiKey: z.string().optional(),
});

export type ProviderImportInput = z.infer<typeof providerImportInputSchema>;

/**
 * A provider draft under test. Everything is the form's current value, not the
 * saved entry, so a key, endpoint or model can be tried before Save writes it.
 * A blank apiKey or header value means "use the stored one".
 */
export const providerTestInputSchema = z.object({
	providerId: z.string().optional(),
	name: z.string().optional(),
	baseUrl: z.union([z.literal(""), z.url()]).optional(),
	api: providerApiSchema.optional(),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	/** The provider's reasoning format, as the draft has it. */
	compat: reasoningCompatSchema.optional(),
	/** A reasoning level for the test; omitted sends no reasoning fields. */
	level: thinkingLevelSchema.optional(),
	/** The model to try. Without one, the provider's first model is used. */
	model: providerModelInputSchema.optional(),
});

export type ProviderTestInput = z.infer<typeof providerTestInputSchema>;

export const providerTestResultSchema = z.object({
	message: z.string(),
});

export type ProviderTestResult = z.infer<typeof providerTestResultSchema>;

export const providerImportResultSchema = z.object({
	models: z.array(providerModelInputSchema),
});

export type ProviderImportResult = z.infer<typeof providerImportResultSchema>;

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
