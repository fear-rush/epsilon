/**
 * The provider contract: the model, reasoning, provider and test shapes, composed
 * from the shared rules, and the routes' documented surface. The handlers are in
 * `routes.ts`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import {
	providerApiSchema,
	providerIdSchema,
	snapshotModelSchema,
	thinkingLevelSchema,
} from "shared";

import { errorContent } from "../../platform/http";

/** One model the runtime exposes: an identity and a label. */
export const catalogModelSchema = z.object(snapshotModelSchema.shape).openapi("SnapshotModel");

/** Which pi thinking levels a model offers, and the value each one sends. */
export const thinkingLevelMapSchema = z
	.partialRecord(thinkingLevelSchema, z.union([z.string().min(1), z.null()]))
	.openapi("ThinkingLevelMap");

export type ThinkingLevelMap = z.infer<typeof thinkingLevelMapSchema>;

/**
 * The compatibility fields that decide how a reasoning level travels. Empty
 * means pi auto-detects; other compat keys are preserved by the writers.
 */
export const reasoningCompatSchema = z
	.looseObject({
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
	})
	.openapi("ReasoningCompat");

export type ReasoningCompat = z.infer<typeof reasoningCompatSchema>;

const providerModelCostSchema = z
	.object({
		input: z.number(),
		output: z.number(),
		cacheRead: z.number(),
		cacheWrite: z.number(),
	})
	.openapi("ProviderModelCost");

/** One model entry the panel edits. Unset fields keep pi's defaults. */
const providerModelInputSchema = z
	.object({
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
	})
	.openapi("ProviderModelInput");

export type ProviderModelInput = z.infer<typeof providerModelInputSchema>;

/** `modelOverrides` changes fields of a model pi ships, without replacing it. */
const modelOverrideSchema = providerModelInputSchema.omit({ id: true }).openapi("ModelOverride");

export type ModelOverride = z.infer<typeof modelOverrideSchema>;

const providerInputSchema = z
	.object({
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
	})
	.openapi("ProviderInput");

export type ProviderInput = z.infer<typeof providerInputSchema>;

export const providerViewSchema = z
	.object({
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
	})
	.openapi("ProviderView");

export type ProviderView = z.infer<typeof providerViewSchema>;

const providerStoredSchema = z
	.object({
		name: z.string().optional(),
		baseUrl: z.string().optional(),
		api: providerApiSchema.optional(),
		compat: reasoningCompatSchema.optional(),
	})
	.openapi("ProviderStored");

const providerDetailSchema = z
	.object({
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
		catalog: z.array(catalogModelSchema),
	})
	.openapi("ProviderDetail");

export type ProviderDetail = z.infer<typeof providerDetailSchema>;

export const builtinProviderSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		/** Already has a models.json entry or a stored credential. */
		configured: z.boolean(),
	})
	.openapi("BuiltinProvider");

export type BuiltinProvider = z.infer<typeof builtinProviderSchema>;

const providerImportInputSchema = z
	.object({
		/** Reuses the stored credential when apiKey is empty. */
		providerId: z.string().optional(),
		baseUrl: z.url(),
		api: providerApiSchema,
		apiKey: z.string().optional(),
	})
	.openapi("ProviderImportInput");

export type ProviderImportInput = z.infer<typeof providerImportInputSchema>;

/**
 * A provider draft under test. Everything is the form's current value, not the
 * saved entry, so a key, endpoint or model can be tried before Save writes it.
 * A blank apiKey or header value means "use the stored one".
 */
const providerTestInputSchema = z
	.object({
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
	})
	.openapi("ProviderTestInput");

export type ProviderTestInput = z.infer<typeof providerTestInputSchema>;

const providerTestResultSchema = z
	.object({
		message: z.string(),
	})
	.openapi("ProviderTestResult");

const providerImportResultSchema = z
	.object({
		models: z.array(providerModelInputSchema),
	})
	.openapi("ProviderImportResult");

const providerParams = z.object({ id: providerIdSchema });

export const readProviderRoute = createRoute({
	method: "get",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "readProvider",
	description: "The editable detail of one provider, with header names but no secrets",
	request: { params: providerParams },
	responses: {
		200: {
			description: "Provider fields, declared models, overrides and the live catalog",
			content: { "application/json": { schema: providerDetailSchema } },
		},
		400: { description: "The provider could not be read", content: errorContent },
		404: { description: "No provider or models.json entry with this id", content: errorContent },
	},
});

export const writeProviderRoute = createRoute({
	method: "post",
	path: "/api/settings/providers",
	tags: ["settings"],
	operationId: "writeProvider",
	description: "Add or change a provider entry in models.json",
	request: {
		body: { required: true, content: { "application/json": { schema: providerInputSchema } } },
	},
	responses: {
		204: { description: "models.json now carries the provider, and live engines reloaded" },
		400: { description: "The provider entry was refused", content: errorContent },
	},
});

export const importModelsRoute = createRoute({
	method: "post",
	path: "/api/settings/providers/models",
	tags: ["settings"],
	operationId: "importProviderModels",
	description: "Read a provider's model list; OpenAI-style and Anthropic endpoints only",
	request: {
		body: {
			required: true,
			content: { "application/json": { schema: providerImportInputSchema } },
		},
	},
	responses: {
		200: {
			description: "Model ids returned by the provider",
			content: { "application/json": { schema: providerImportResultSchema } },
		},
		400: { description: "The endpoint refused or returned no model list", content: errorContent },
	},
});

export const testProviderRoute = createRoute({
	method: "post",
	path: "/api/settings/providers/test",
	tags: ["settings"],
	operationId: "testProvider",
	description: "Try a provider draft's model without writing models.json",
	request: {
		body: {
			required: true,
			content: { "application/json": { schema: providerTestInputSchema } },
		},
	},
	responses: {
		200: {
			description: "The draft reached its model",
			content: { "application/json": { schema: providerTestResultSchema } },
		},
		400: { description: "The provider refused or could not be reached", content: errorContent },
	},
});

export const deleteProviderRoute = createRoute({
	method: "delete",
	path: "/api/settings/providers/{id}",
	tags: ["settings"],
	operationId: "deleteProvider",
	request: { params: providerParams },
	responses: {
		204: {
			description: "The provider entry and its stored credential are gone from the agent home",
		},
		400: { description: "models.json could not be written", content: errorContent },
	},
});
