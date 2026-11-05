import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ThinkingLevel } from "../conversation/session.ts";
import { ProviderRefused } from "../errors.ts";

/** What pi can collect for a provider: an account, or a key it asks for itself. */
export const ProviderLoginType = Schema.Literals(["api_key", "oauth"]);
export type ProviderLoginType = typeof ProviderLoginType.Type;

/** One question pi asked during a sign-in and cannot go on without. */
export const ProviderLoginQuestion = Schema.Struct({
	id: Schema.String,
	/** Where the answer goes: a field, a hidden field, or one of `options`. */
	kind: Schema.Literals(["text", "secret", "select", "manual_code"]),
	message: Schema.String,
	placeholder: Schema.optional(Schema.String),
	/** The choices of a `select`; answering sends one of their ids. */
	options: Schema.optional(
		Schema.Array(
			Schema.Struct({
				id: Schema.String,
				label: Schema.String,
				description: Schema.optional(Schema.String),
			}),
		),
	),
});
export type ProviderLoginQuestion = typeof ProviderLoginQuestion.Type;

/** One thing pi reported while it worked. */
export const ProviderLoginNotice = Schema.Struct({
	message: Schema.String,
	links: Schema.optional(
		Schema.Array(Schema.Struct({ url: Schema.String, label: Schema.optional(Schema.String) })),
	),
});
export type ProviderLoginNotice = typeof ProviderLoginNotice.Type;

/**
 * A sign-in as the browser can see it. The credential never travels: only what pi
 * reports and what it is waiting for.
 */
export const ProviderLoginSnapshot = Schema.Struct({
	providerId: Schema.String,
	type: ProviderLoginType,
	status: Schema.Literals(["running", "succeeded", "failed", "cancelled"]),
	notices: Schema.Array(ProviderLoginNotice),
	/** Where the operator finishes an account sign-in. */
	authUrl: Schema.optional(
		Schema.Struct({ url: Schema.String, instructions: Schema.optional(Schema.String) }),
	),
	/** A code to type on another device instead of following a link. */
	deviceCode: Schema.optional(
		Schema.Struct({
			userCode: Schema.String,
			verificationUri: Schema.String,
			intervalSeconds: Schema.optional(Schema.Finite),
			expiresInSeconds: Schema.optional(Schema.Finite),
		}),
	),
	/** The question pi waits on, when it waits on one. */
	question: Schema.optional(ProviderLoginQuestion),
	/** One sentence when the sign-in did not succeed. */
	error: Schema.optional(Schema.String),
});
export type ProviderLoginSnapshot = typeof ProviderLoginSnapshot.Type;

/**
 * Settings → Providers: what pi composed, and the `models.json` entries Epsilon may edit.
 *
 * The list is pi's own answer (`ModelRuntime.getProviders()`), enriched with the auth
 * source `getProviderAuthStatus()` names and whether the provider is built in. Credentials
 * are never carried on the wire: only the source label pi reports.
 */

export const ProviderAuth = Schema.Struct({
	configured: Schema.Boolean,
	/** pi's own word for where the credential came from, such as `models_json_key`. */
	source: Schema.optional(Schema.String),
	/** The label pi shows for that source, such as an environment variable's name. */
	label: Schema.optional(Schema.String),
});
export type ProviderAuth = typeof ProviderAuth.Type;

export const ProviderRow = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	/** pi ships this id, whether or not `models.json` also describes it. */
	builtin: Schema.Boolean,
	/** `models.json` describes this provider, so its fields can be edited here. */
	custom: Schema.Boolean,
	models: Schema.Int,
	auth: ProviderAuth,
});
export type ProviderRow = typeof ProviderRow.Type;

export const ProvidersView = Schema.Struct({
	/** pi's sentence when it could not compose the catalog at all. */
	error: Schema.optional(Schema.String),
	providers: Schema.Array(ProviderRow),
});
export type ProvidersView = typeof ProvidersView.Type;

/** One model pi composed, as a picker lists it. Credentials are not part of it. */
export const ProviderModelView = Schema.Struct({
	provider: Schema.String,
	id: Schema.String,
	name: Schema.String,
});
export type ProviderModelView = typeof ProviderModelView.Type;

export const ProviderModelsView = Schema.Struct({
	models: Schema.Array(ProviderModelView),
});
export type ProviderModelsView = typeof ProviderModelsView.Type;

/**
 * `models.json`'s model shape: what the model dialog edits, and the reasoning block pi
 * and the form both read. Every field but the id is optional, so an entry names only
 * what it changes and an unset field keeps pi's default.
 */

/** pi's API family names, the four client families a settings entry may name. */
export const ProviderApi = Schema.Literals([
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
]);
export type ProviderApi = typeof ProviderApi.Type;

/** Which pi thinking levels a model offers, and the value each one sends. */
export const ThinkingLevelMap = Schema.Record(
	ThinkingLevel,
	Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
);
export type ThinkingLevelMap = typeof ThinkingLevelMap.Type;

/** Where a reasoning level goes in a request body. */
export const ThinkingFormat = Schema.Literals([
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
]);
export type ThinkingFormat = typeof ThinkingFormat.Type;

/** The request field that caps reasoning tokens for an endpoint sharing `max_tokens`. */
export const ThinkingTokenBudgetField = Schema.Literals([
	"thinking_token_budget",
	"thinking_budget",
	"thinking_budget_tokens",
]);
export type ThinkingTokenBudgetField = typeof ThinkingTokenBudgetField.Type;

/** How a reasoning level travels. Empty means pi auto-detects from the API family. */
export const ReasoningCompat = Schema.Struct({
	thinkingFormat: Schema.optional(ThinkingFormat),
	supportsReasoningEffort: Schema.optional(Schema.Boolean),
	thinkingTokenBudgetField: Schema.optional(ThinkingTokenBudgetField),
	requiresReasoningContentOnAssistantMessages: Schema.optional(Schema.Boolean),
	forceAdaptiveThinking: Schema.optional(Schema.Boolean),
});
export type ReasoningCompat = typeof ReasoningCompat.Type;

/** One request-wide price tier; the highest threshold a request passes applies. */
export const ProviderModelCostTier = Schema.Struct({
	inputTokensAbove: Schema.Finite,
	input: Schema.Finite,
	output: Schema.Finite,
	cacheRead: Schema.Finite,
	cacheWrite: Schema.Finite,
});
export type ProviderModelCostTier = typeof ProviderModelCostTier.Type;

/** A model's four rates, and the tiers that price a large request instead. */
export const ProviderModelCost = Schema.Struct({
	input: Schema.Finite,
	output: Schema.Finite,
	cacheRead: Schema.Finite,
	cacheWrite: Schema.Finite,
	tiers: Schema.optional(Schema.Array(ProviderModelCostTier)),
});
export type ProviderModelCost = typeof ProviderModelCost.Type;

/** pi merges an override's cost per field, so an override may name only some rates. */
export const ModelOverrideCost = Schema.Struct({
	input: Schema.optional(Schema.Finite),
	output: Schema.optional(Schema.Finite),
	cacheRead: Schema.optional(Schema.Finite),
	cacheWrite: Schema.optional(Schema.Finite),
	tiers: Schema.optional(Schema.Array(ProviderModelCostTier)),
});
export type ModelOverrideCost = typeof ModelOverrideCost.Type;

/** A count of bytes or pixels a request may not pass. */
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/** A positive number of seconds. */
const PositiveSeconds = Schema.Finite.check(Schema.isGreaterThan(0));

/** How a request may be shaped before it leaves the engine. */
export const ModelInputLimits = Schema.Struct({
	maxRequestBytes: Schema.optional(PositiveInt),
	images: Schema.optional(
		Schema.Struct({
			resize: Schema.optional(
				Schema.Struct({
					maxWidth: Schema.optional(PositiveInt),
					maxHeight: Schema.optional(PositiveInt),
					maxBytes: Schema.optional(PositiveInt),
					jpegQuality: Schema.optional(
						Schema.Int.check(Schema.isBetween({ maximum: 100, minimum: 1 })),
					),
				}),
			),
			maxPerMessage: Schema.optional(PositiveInt),
			maxPerRequest: Schema.optional(PositiveInt),
		}),
	),
});
export type ModelInputLimits = typeof ModelInputLimits.Type;

/** The cache lifetime pi warms for each retention tier, in seconds. */
export const ModelPromptCache = Schema.Struct({
	short: Schema.optional(PositiveSeconds),
	long: Schema.optional(PositiveSeconds),
});
export type ModelPromptCache = typeof ModelPromptCache.Type;

/** Extra request-body fields, merged into every request pi sends for the model. */
export const SamplingParams = Schema.Record(Schema.String, Schema.Json);
export type SamplingParams = typeof SamplingParams.Type;

export const SamplingParamsByThinkingLevel = Schema.Record(
	ThinkingLevel,
	Schema.optional(SamplingParams),
);
export type SamplingParamsByThinkingLevel = typeof SamplingParamsByThinkingLevel.Type;

/** What a model entry and an override both carry, so an override can name any of it. */
const modelFields = {
	name: Schema.optional(Schema.String),
	/** A model's own family and endpoint; unset keeps the provider's. */
	api: Schema.optional(ProviderApi),
	baseUrl: Schema.optional(Schema.String),
	reasoning: Schema.optional(Schema.Boolean),
	thinkingLevelMap: Schema.optional(ThinkingLevelMap),
	compat: Schema.optional(ReasoningCompat),
	input: Schema.optional(Schema.Array(Schema.Literals(["text", "image"]))),
	inputLimits: Schema.optional(ModelInputLimits),
	promptCache: Schema.optional(ModelPromptCache),
	samplingParams: Schema.optional(SamplingParams),
	samplingParamsByThinkingLevel: Schema.optional(SamplingParamsByThinkingLevel),
	/** Header names only reach the page; values stay on the server. */
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	contextWindow: Schema.optional(PositiveInt),
	maxTokens: Schema.optional(PositiveInt),
} as const;

/** One model a provider declares in `models.json`; unset fields keep pi's defaults. */
export const ProviderModelInput = Schema.Struct({
	id: Schema.NonEmptyString,
	...modelFields,
	cost: Schema.optional(ProviderModelCost),
});
export type ProviderModelInput = typeof ProviderModelInput.Type;

/** A change to a model pi ships: only the fields the operator touched travel. */
export const ModelOverride = Schema.Struct({
	...modelFields,
	cost: Schema.optional(ModelOverrideCost),
});
export type ModelOverride = typeof ModelOverride.Type;

/** The stored `models.json` fields the editor may prefill. The key is never carried. */
export const ProviderStored = Schema.Struct({
	name: Schema.optional(Schema.String),
	baseUrl: Schema.optional(Schema.String),
	api: Schema.optional(Schema.String),
	/** How a key is stored: a literal, `$NAME`, `!command`, or absent. Never its value. */
	apiKeyForm: Schema.optional(Schema.Literals(["literal", "environment", "command"])),
	/** Provider-wide reasoning format; each model's compat overrides it. */
	compat: Schema.optional(ReasoningCompat),
	/** pi's `authHeader`: unset keeps pi's default, a boolean forces or drops the header. */
	authHeader: Schema.optional(Schema.Boolean),
	/** pi's radius OAuth flow, which needs a base URL of its own. */
	oauth: Schema.optional(Schema.Literal("radius")),
});
export type ProviderStored = typeof ProviderStored.Type;

/**
 * One model of a provider's effective catalog. It carries every field an override can
 * change, so the dialog seeds from pi's value instead of an empty one.
 */
export const ProviderCatalogModel = Schema.Struct({
	provider: Schema.String,
	id: Schema.NonEmptyString,
	...modelFields,
	cost: Schema.optional(ProviderModelCost),
});
export type ProviderCatalogModel = typeof ProviderCatalogModel.Type;

/** One provider as the editor needs it: pi's row, the stored entry, and its models. */
export const ProviderDetail = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	builtin: Schema.Boolean,
	custom: Schema.Boolean,
	/** The `models.json` entry's editable fields; empty when pi ships it alone. */
	stored: ProviderStored,
	/** Header names only; a stored header's value never travels to the page. */
	headerKeys: Schema.Array(Schema.String),
	/** The models the entry declares, which replace a built-in catalog. */
	models: Schema.Array(ProviderModelInput),
	/** The changes to pi's own models, field by field. */
	modelOverrides: Schema.Record(Schema.String, ModelOverride),
	/** Every model pi composed for this provider, with the stored override applied. */
	catalog: Schema.Array(ProviderCatalogModel),
	auth: ProviderAuth,
});
export type ProviderDetail = typeof ProviderDetail.Type;

/** The model a test tries: an override may name a partial cost, and the probe fills the rest. */
export const ProviderTestModel = Schema.Struct({
	id: Schema.NonEmptyString,
	...modelFields,
	cost: Schema.optional(ModelOverrideCost),
});
export type ProviderTestModel = typeof ProviderTestModel.Type;

/**
 * A provider draft under test. Everything is the form's current value, not the saved
 * entry, so a key, endpoint or model can be tried before Save writes it. A blank apiKey
 * or header value means "use the stored one".
 */
export const ProviderTestInput = Schema.Struct({
	providerId: Schema.optional(Schema.String),
	name: Schema.optional(Schema.String),
	baseUrl: Schema.optional(Schema.String),
	api: Schema.optional(ProviderApi),
	apiKey: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	/** The provider's reasoning format, as the draft has it. */
	compat: Schema.optional(ReasoningCompat),
	/** pi's `authHeader` as the draft has it; unset keeps the stored entry's. */
	authHeader: Schema.optional(Schema.Boolean),
	/** A reasoning level for the test; omitted sends no reasoning fields. */
	level: Schema.optional(ThinkingLevel),
	/** The model to try. Without one, the provider's first model is used. */
	model: Schema.optional(ProviderTestModel),
});
export type ProviderTestInput = typeof ProviderTestInput.Type;

/**
 * One provider as a save writes it. An empty name, base URL or family clears the
 * stored value; a blank key keeps it.
 */
export const ProviderInput = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	/** Empty clears the stored endpoint, which pi then inherits. */
	baseUrl: Schema.String,
	/** One of pi's API family names; empty clears the stored family. */
	api: Schema.String,
	/** A literal, `$NAME`, or `!command`, the three forms pi's field accepts. */
	apiKey: Schema.optional(Schema.String),
	/** An empty value for a stored name keeps it; a name left out is removed. */
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	/** Provider-wide reasoning format; each model's compat overrides it per key. */
	compat: Schema.optional(ReasoningCompat),
	/** pi's `authHeader`: empty keeps the stored answer, a boolean writes one. */
	authHeader: Schema.optional(Schema.Union([Schema.Literal(""), Schema.Boolean])),
	/** pi's radius OAuth flow; empty keeps it unset, `radius` turns it on. */
	oauth: Schema.optional(Schema.Union([Schema.Literal(""), Schema.Literal("radius")])),
	/** Omitted keeps a built-in provider's catalog in place. */
	models: Schema.optional(Schema.Array(ProviderModelInput)),
	modelOverrides: Schema.optional(Schema.Record(Schema.String, ModelOverride)),
});
export type ProviderInput = typeof ProviderInput.Type;

/**
 * Reading a provider's model list. The endpoint is the provider's, and the key is the
 * one typed in the form or the credential the home already stores.
 */
export const ProviderImportInput = Schema.Struct({
	/** Reuses the stored credential when `apiKey` is empty. */
	providerId: Schema.optional(Schema.String),
	baseUrl: Schema.String,
	api: ProviderApi,
	apiKey: Schema.optional(Schema.String),
});
export type ProviderImportInput = typeof ProviderImportInput.Type;

export const ProviderImportResult = Schema.Struct({
	models: Schema.Array(ProviderModelInput),
});
export type ProviderImportResult = typeof ProviderImportResult.Type;

/** What a provider test reports: one sentence the page shows above the form. */
export const ProviderTestResult = Schema.Struct({
	message: Schema.String,
});
export type ProviderTestResult = typeof ProviderTestResult.Type;

export const ProviderRpcs = RpcGroup.make(
	Rpc.make("settings.providers.list", {
		success: ProvidersView,
	}),
	Rpc.make("settings.providers.models", {
		success: ProviderModelsView,
	}),
	Rpc.make("settings.providers.read", {
		payload: { id: Schema.String },
		success: ProviderDetail,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.save", {
		payload: ProviderInput,
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.remove", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.setApiKey", {
		payload: { id: Schema.String, apiKey: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.import", {
		payload: ProviderImportInput,
		success: ProviderImportResult,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.test", {
		payload: ProviderTestInput,
		success: ProviderTestResult,
		error: ProviderRefused,
	}),
);

export const ProviderLoginRpcs = RpcGroup.make(
	Rpc.make("settings.providers.login", {
		payload: { providerId: Schema.String, type: ProviderLoginType },
		success: ProviderLoginSnapshot,
		error: ProviderRefused,
		stream: true,
	}),
	Rpc.make("settings.providers.answerLogin", {
		payload: { providerId: Schema.String, promptId: Schema.String, value: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("settings.providers.cancelLogin", {
		payload: { providerId: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
);
