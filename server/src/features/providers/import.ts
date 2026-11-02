/**
 * Reading a provider's model list. pi exposes no query for a custom endpoint, so
 * this is Epsilon's own HTTP call, bounded and without redirects. It follows the
 * documented list endpoints: `{base}/models` for the OpenAI families and
 * `{base}/v1/models` for Anthropic. Google's list API is a different shape, so
 * the panel asks for those models by hand.
 */
import { providerModelsEndpoint } from "shared";
import type { ProviderApi } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import type { ModelRuntime } from "../../platform/pi";
import type { ProviderImportInput, ProviderModelInput } from "./contract";
import { readProvidersFile } from "./store";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

const modelEntrySchema = z.looseObject({
	id: z.string().min(1),
	name: z.string().optional(),
	/** Some gateways say which paths a model accepts; commandcode does. */
	supported_endpoints: z.array(z.string()).optional(),
});

const modelListSchema = z.union([
	z.looseObject({ data: z.array(modelEntrySchema) }),
	z.array(modelEntrySchema),
]);

/**
 * pi's header rules, for the list request Epsilon makes itself. A configured
 * `authHeader` sends the key as `Authorization: Bearer` and wins over the family
 * default, which is what a gateway that only accepts bearer auth needs. A header
 * the credential resolved to `null` is suppressed, not replaced by that default.
 */
const authHeaders = (
	api: ProviderApi,
	apiKey: string | undefined,
	resolved: Record<string, string | null> | undefined,
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
const resolvedBaseUrl = (baseUrl: string, env: Record<string, string> | undefined): string =>
	env === undefined
		? baseUrl
		: baseUrl.replace(
				/\{([A-Za-z0-9_]+)\}/gu,
				(placeholder, name: string) => env[name] ?? placeholder,
			);

type LibraryModel = ReturnType<ModelRuntime["getModels"]>[number];

/** An Anthropic client appends `/v1/messages`, so a base ending in `/v1` doubles it. */
const withoutVersion = (baseUrl: string): string => {
	const url = new URL(baseUrl);
	url.pathname = url.pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "") || "/";
	return url.toString().replace(/\/$/u, "");
};

/**
 * One entry from the list. A gateway that serves a model only through Anthropic
 * Messages gets a per-model API and the base above its `/v1`, because the
 * provider-level OpenAI shape would reject it.
 */
const modelOf = (
	entry: z.infer<typeof modelEntrySchema>,
	options: { api: ProviderApi; baseUrl: string; library: readonly LibraryModel[] },
): ProviderModelInput => {
	const model: ProviderModelInput =
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

	// pi's catalog knows more about a model than a gateway list does. Copy the
	// reasoning capability and level map for an exact id with the same API, and
	// the Anthropic-specific adaptive switch. Other compat stays with the gateway.
	const effectiveApi = model.api ?? options.api;
	const match = options.library.find(
		(candidate) => candidate.id === entry.id && candidate.api === effectiveApi,
	);
	if (match !== undefined) {
		if (match.reasoning) model.reasoning = true;
		if (match.thinkingLevelMap !== undefined) model.thinkingLevelMap = match.thinkingLevelMap;
		if (effectiveApi === "anthropic-messages") {
			// SAFETY: only an Anthropic model carries forceAdaptiveThinking.
			const compat = match.compat as { forceAdaptiveThinking?: boolean } | undefined;
			if (compat?.forceAdaptiveThinking !== undefined) {
				model.compat = {
					...(model.compat ?? {}),
					forceAdaptiveThinking: compat.forceAdaptiveThinking,
				};
			}
		}
	}
	return model;
};

const importModels = async (options: {
	api: ProviderApi;
	baseUrl: string;
	apiKey?: string;
	authHeader: boolean;
	headers?: Record<string, string | null>;
	library: readonly LibraryModel[];
}): Promise<ProviderModelInput[]> => {
	const url = providerModelsEndpoint(options.api, options.baseUrl);
	if (url === undefined) {
		throw new Error("This API family has no shared model list; add models by hand");
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`"${url}" is not a URL`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("The base URL must use http or https");
	}

	const response = await fetch(parsed, {
		headers: authHeaders(options.api, options.apiKey, options.headers, options.authHeader),
		signal: AbortSignal.timeout(TIMEOUT_MS),
		redirect: "error",
	});
	if (!response.ok) {
		throw new Error(`The model list answered ${response.status} ${response.statusText} at ${url}`);
	}
	const declared = Number(response.headers.get("content-length") ?? "0");
	if (declared > MAX_BYTES) throw new Error("The model list is too large to read");

	const body = await response.text();
	if (body.length > MAX_BYTES) throw new Error("The model list is too large to read");

	try {
		const payload = modelListSchema.parse(JSON.parse(body));
		const entries = Array.isArray(payload) ? payload : payload.data;
		const seen = new Set<string>();
		const models: ProviderModelInput[] = [];
		for (const entry of entries) {
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			models.push(modelOf(entry, options));
		}
		return models;
	} catch {
		throw new Error("The endpoint did not return a model list");
	}
};

/**
 * Read a provider's model list for the settings panel. A key typed in the form
 * wins; otherwise the provider's stored credential (auth.json) is used, which is
 * what makes an import work right after a login in a terminal using the same home.
 */
export const importModelsForHome = async (
	home: AgentHome,
	input: ProviderImportInput,
): Promise<ProviderModelInput[]> => {
	const runtime = await modelRuntime(home);
	const entry =
		input.providerId === undefined ? undefined : (await readProvidersFile(home))[input.providerId];
	const typedKey = input.apiKey?.trim();
	const stored =
		typedKey === undefined && input.providerId !== undefined
			? await runtime.getAuth(input.providerId)
			: undefined;
	return importModels({
		api: input.api,
		// A credential can carry its own base URL and the values its placeholders need.
		baseUrl: resolvedBaseUrl(stored?.auth.baseUrl ?? input.baseUrl, stored?.env),
		apiKey: typedKey ?? stored?.auth.apiKey,
		authHeader: entry?.authHeader === true,
		headers: stored?.auth.headers,
		library: runtime.getModels(),
	});
};
