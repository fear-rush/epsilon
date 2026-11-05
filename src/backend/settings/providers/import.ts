import { Effect, Option, Schema } from "effect";

import { providerModelsEndpoint } from "#domain/providers/rules";
import type { ProviderApi } from "#domain/providers/rules";
import { ProviderRefused } from "#protocol/errors";
import { ReasoningCompat } from "#protocol/settings/providers";
import type { ProviderImportInput, ProviderModelInput } from "#protocol/settings/providers";

import type { ModelRuntime } from "../../platform/pi.ts";
import type { ProvidersStoreApi } from "./store.ts";

/**
 * Reading a provider's model list. pi exposes no query for a custom endpoint, so this
 * is Epsilon's own HTTP call, bounded and without redirects. It follows the documented
 * list endpoints: `{base}/models` for the OpenAI families and `{base}/v1/models` for
 * Anthropic. Google's list API is a different shape, so the panel asks for those models
 * by hand.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

/** One entry of a gateway's list. A field this version does not know is ignored. */
const ModelEntry = Schema.Struct({
	id: Schema.NonEmptyString,
	name: Schema.optional(Schema.String),
	/** Some gateways say which paths a model accepts; commandcode does. */
	supported_endpoints: Schema.optional(Schema.Array(Schema.String)),
});
type ModelEntry = typeof ModelEntry.Type;

/** A list is either wrapped in `data`, as OpenAI's is, or bare. */
const ModelList = Schema.Union([
	Schema.Struct({ data: Schema.Array(ModelEntry) }),
	Schema.Array(ModelEntry),
]);

/** One model pi composed, without importing pi's own type into this feature. */
type LibraryModel = ReturnType<ModelRuntime["getModels"]>[number];

/** A decoded model with its fields writable, for a model assembled one field at a time. */
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

const refused = (subject: string, reason: string): ProviderRefused =>
	new ProviderRefused({ providerId: subject, reason });

const messageOf = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

/**
 * pi's header rules, for the list request Epsilon makes itself. A configured
 * `authHeader` sends the key as `Authorization: Bearer` and wins over the family
 * default, which is what a gateway that only accepts bearer auth needs. A header the
 * credential resolved to `null` is suppressed, not replaced by that default.
 */
const authHeaders = (
	api: ProviderApi,
	apiKey: string | undefined,
	resolved: Readonly<Record<string, string | null>> | undefined,
	authHeader: boolean,
): Record<string, string> => {
	const headers = new Map<string, string | null>([["accept", "application/json"]]);
	for (const [name, value] of Object.entries(resolved ?? {})) {
		headers.set(name.toLowerCase(), value);
	}
	const key = apiKey?.trim();
	const hasKey = key !== undefined && key !== "";
	if (hasKey && authHeader) {
		// pi applies this after its own merge, so it wins over a configured header.
		headers.set("authorization", `Bearer ${key}`);
	} else if (api === "anthropic-messages") {
		if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
		if (hasKey && !headers.has("x-api-key")) headers.set("x-api-key", key);
	} else if (hasKey && !headers.has("authorization")) {
		headers.set("authorization", `Bearer ${key}`);
	}
	return Object.fromEntries(
		[...headers].filter((entry): entry is [string, string] => entry[1] !== null),
	);
};

/** Fill the credential's `{NAME}` placeholders, as pi's Cloudflare adapter does. */
const resolvedBaseUrl = (
	baseUrl: string,
	env: Readonly<Record<string, string>> | undefined,
): string =>
	env === undefined
		? baseUrl
		: baseUrl.replaceAll(
				/\{([A-Za-z0-9_]+)\}/gu,
				(placeholder, name: string) => env[name] ?? placeholder,
			);

/** An Anthropic client appends `/v1/messages`, so a base ending in `/v1` doubles it. */
const withoutVersion = (baseUrl: string): string => {
	if (!URL.canParse(baseUrl)) return baseUrl;
	const url = new URL(baseUrl);
	url.pathname = url.pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "") || "/";
	return url.toString().replace(/\/$/u, "");
};

/**
 * One entry from the list. A gateway that serves a model only through Anthropic Messages
 * gets a per-model API and the base above its `/v1`, because the provider-level OpenAI
 * shape would reject it.
 */
const modelOf = (
	entry: ModelEntry,
	options: {
		readonly api: ProviderApi;
		readonly baseUrl: string;
		readonly library: ReadonlyArray<LibraryModel>;
	},
): ProviderModelInput => {
	const model: Mutable<ProviderModelInput> =
		entry.name === undefined ? { id: entry.id } : { id: entry.id, name: entry.name };
	const endpoints = entry.supported_endpoints ?? [];
	const messages = endpoints.includes("/messages");
	const chat = endpoints.includes("/chat/completions");
	const responses = endpoints.includes("/responses");
	if (messages && !chat && !responses && options.api !== "anthropic-messages") {
		model.api = "anthropic-messages";
		model.baseUrl = withoutVersion(options.baseUrl);
	} else if (responses && !chat && !messages && options.api !== "openai-responses") {
		model.api = "openai-responses";
	}

	// pi's catalog knows more about a model than a gateway list does. Copy the reasoning
	// capability and level map for an exact id with the same API, and the Anthropic-only
	// adaptive switch. Every other compat field stays with the gateway.
	const effectiveApi = model.api ?? options.api;
	const match = options.library.find(
		(candidate) => candidate.id === entry.id && candidate.api === effectiveApi,
	);
	if (match === undefined) return model;
	if (match.reasoning) model.reasoning = true;
	if (match.thinkingLevelMap !== undefined) model.thinkingLevelMap = match.thinkingLevelMap;
	if (effectiveApi === "anthropic-messages") {
		const compat = Schema.decodeUnknownOption(ReasoningCompat)(match.compat);
		const adaptive = Option.isSome(compat) ? compat.value.forceAdaptiveThinking : undefined;
		if (adaptive !== undefined) model.compat = { forceAdaptiveThinking: adaptive };
	}
	return model;
};

/** The list's entries as the models the dialog offers, one per id and in list order. */
const modelsOf = (
	entries: ReadonlyArray<ModelEntry>,
	options: {
		readonly api: ProviderApi;
		readonly baseUrl: string;
		readonly library: ReadonlyArray<LibraryModel>;
	},
): ReadonlyArray<ProviderModelInput> => {
	const seen = new Set<string>();
	const models: ProviderModelInput[] = [];
	for (const entry of entries) {
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		models.push(modelOf(entry, options));
	}
	return models;
};

export type ImportOptions = {
	readonly subject: string;
	readonly api: ProviderApi;
	readonly baseUrl: string;
	readonly apiKey?: string | undefined;
	readonly authHeader: boolean;
	readonly headers?: Readonly<Record<string, string | null>> | undefined;
	readonly library: ReadonlyArray<LibraryModel>;
};

/** The provider's own model list, read within one bounded, redirect-free request. */
export const importModels = (
	options: ImportOptions,
): Effect.Effect<ReadonlyArray<ProviderModelInput>, ProviderRefused> =>
	Effect.gen(function* () {
		const url = providerModelsEndpoint(options.api, options.baseUrl);
		if (url === undefined) {
			return yield* refused(
				options.subject,
				"This API family has no shared model list; add models by hand.",
			);
		}
		const endpoint =
			URL.canParse(url) && ["http:", "https:"].includes(new URL(url).protocol)
				? new URL(url)
				: undefined;
		if (endpoint === undefined) {
			return yield* refused(options.subject, `"${url}" is not an http URL.`);
		}
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(endpoint, {
					headers: authHeaders(options.api, options.apiKey, options.headers, options.authHeader),
					redirect: "error",
					signal: AbortSignal.timeout(TIMEOUT_MS),
				}),
			catch: (cause) =>
				refused(options.subject, `The model list could not be reached (${messageOf(cause)}).`),
		});
		if (!response.ok) {
			return yield* refused(
				options.subject,
				`The model list answered ${response.status} ${response.statusText} at ${url}.`,
			);
		}
		if (Number(response.headers.get("content-length") ?? "0") > MAX_BYTES) {
			return yield* refused(options.subject, "The model list is too large to read.");
		}
		const body = yield* Effect.tryPromise({
			try: () => response.text(),
			catch: (cause) =>
				refused(options.subject, `The model list could not be read (${messageOf(cause)}).`),
		});
		if (body.length > MAX_BYTES) {
			return yield* refused(options.subject, "The model list is too large to read.");
		}
		const parsed = Schema.decodeOption(Schema.fromJsonString(ModelList))(body);
		if (Option.isNone(parsed)) {
			return yield* refused(options.subject, "The endpoint did not return a model list.");
		}
		const entries = "data" in parsed.value ? parsed.value.data : parsed.value;
		return modelsOf(entries, options);
	});

/** The credential pi resolved for a provider, or nothing when it has none. */
const credentialOf = (runtime: ModelRuntime, providerId: string) =>
	Effect.tryPromise({
		try: () => runtime.getAuth(providerId),
		catch: (cause) =>
			refused(providerId, `The stored credential could not be read (${messageOf(cause)}).`),
	});

/**
 * Read a provider's model list for the settings panel. A key typed in the form wins;
 * otherwise the provider's stored credential is used, which is what makes an import work
 * right after a sign-in in a terminal using the same home.
 */
export const importModelsFor = (
	runtime: ModelRuntime,
	store: ProvidersStoreApi,
	input: ProviderImportInput,
): Effect.Effect<ReadonlyArray<ProviderModelInput>, ProviderRefused> => {
	const subject = input.providerId ?? input.baseUrl;
	return Effect.gen(function* () {
		const entry = input.providerId === undefined ? undefined : yield* store.read(input.providerId);
		const typedKey = input.apiKey?.trim();
		const stored =
			typedKey === undefined && input.providerId !== undefined
				? yield* credentialOf(runtime, input.providerId)
				: undefined;
		return yield* importModels({
			api: input.api,
			// A credential can carry its own base URL and the values its placeholders need.
			apiKey: typedKey ?? stored?.auth.apiKey,
			authHeader: entry?.stored.authHeader === true,
			baseUrl: resolvedBaseUrl(stored?.auth.baseUrl ?? input.baseUrl, stored?.env),
			headers: stored?.auth.headers,
			library: runtime.getModels(),
			subject,
		});
	});
};
