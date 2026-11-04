import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

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

/** The model fields the provider dialog writes; every other field of a model survives. */
export const ProviderModelInput = Schema.Struct({
	id: Schema.String,
	name: Schema.optional(Schema.String),
	contextWindow: Schema.optional(Schema.Int),
	maxTokens: Schema.optional(Schema.Int),
});
export type ProviderModelInput = typeof ProviderModelInput.Type;

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
	Rpc.make("config.providers.list", {
		success: ProvidersView,
	}),
	Rpc.make("config.providers.models", {
		success: ProviderModelsView,
	}),
	Rpc.make("config.providers.save", {
		payload: ProviderInput,
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("config.providers.remove", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("config.providers.setApiKey", {
		payload: { id: Schema.String, apiKey: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
);

export const ProviderLoginRpcs = RpcGroup.make(
	Rpc.make("config.providers.login", {
		payload: { providerId: Schema.String, type: ProviderLoginType },
		success: ProviderLoginSnapshot,
		error: ProviderRefused,
		stream: true,
	}),
	Rpc.make("config.providers.answerLogin", {
		payload: { providerId: Schema.String, promptId: Schema.String, value: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
	Rpc.make("config.providers.cancelLogin", {
		payload: { providerId: Schema.String },
		success: Schema.Void,
		error: ProviderRefused,
	}),
);
