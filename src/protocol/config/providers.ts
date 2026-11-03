import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ProviderRefused } from "../errors.ts";

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
