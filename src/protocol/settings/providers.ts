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

/** How a reasoning level travels. Empty means pi auto-detects from the API family. */
export const ReasoningCompat = Schema.Struct({
	thinkingFormat: Schema.optional(
		Schema.Literals([
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
		]),
	),
	supportsReasoningEffort: Schema.optional(Schema.Boolean),
	thinkingTokenBudgetField: Schema.optional(
		Schema.Literals(["thinking_token_budget", "thinking_budget", "thinking_budget_tokens"]),
	),
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

/** One model a provider declares in `models.json`; unset fields keep pi's defaults. */
export const ProviderModelInput = Schema.Struct({
	id: Schema.NonEmptyString,
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
	cost: Schema.optional(ProviderModelCost),
});
export type ProviderModelInput = typeof ProviderModelInput.Type;

/** The stored `models.json` fields the editor may prefill. The key is never carried. */
export const ProviderStored = Schema.Struct({
	name: Schema.optional(Schema.String),
	baseUrl: Schema.optional(Schema.String),
	api: Schema.optional(Schema.String),
	/** How a key is stored: a literal, `$NAME`, `!command`, or absent. Never its value. */
	apiKeyForm: Schema.optional(Schema.Literals(["literal", "environment", "command"])),
});
export type ProviderStored = typeof ProviderStored.Type;

/** One provider as the editor needs it: pi's row, the stored entry, and its models. */
export const ProviderDetail = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	builtin: Schema.Boolean,
	custom: Schema.Boolean,
	/** The `models.json` entry's editable fields, or null when pi ships it alone. */
	stored: Schema.NullOr(ProviderStored),
	models: Schema.Array(ProviderModelInput),
	auth: ProviderAuth,
});
export type ProviderDetail = typeof ProviderDetail.Type;

export const ProviderInput = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	baseUrl: Schema.String,
	/** One of pi's API family names, such as `openai-completions`. */
	api: Schema.String,
	/** A literal, `$NAME`, or `!command`, the three forms pi's field accepts. */
	apiKey: Schema.optional(Schema.String),
	models: Schema.Array(ProviderModelInput),
});
export type ProviderInput = typeof ProviderInput.Type;

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
