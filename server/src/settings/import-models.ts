/**
 * Reading a provider's model list. pi exposes no query for a custom endpoint, so
 * this is Epsilon's own HTTP call, bounded and without redirects. It follows the
 * documented list endpoints: `{base}/models` for the OpenAI families and
 * `{base}/v1/models` for Anthropic. Google's list API is a different shape, so
 * the panel asks for those models by hand.
 */
import { providerModelsEndpoint } from "shared";
import type { ProviderApi, ProviderModelInput } from "shared";
import { z } from "zod";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

const modelEntrySchema = z.looseObject({
	id: z.string().min(1),
	name: z.string().optional(),
});

const modelListSchema = z.union([
	z.looseObject({ data: z.array(modelEntrySchema) }),
	z.array(modelEntrySchema),
]);

const authHeaders = (
	api: ProviderApi,
	apiKey: string | undefined,
	stored: Record<string, string> | undefined,
) => {
	const entries: [string, string][] = [
		["accept", "application/json"],
		...Object.entries(stored ?? {}),
	];
	const has = (name: string) => entries.some(([key]) => key.toLowerCase() === name);
	if (api === "anthropic-messages") {
		if (!has("anthropic-version")) entries.push(["anthropic-version", "2023-06-01"]);
		if (apiKey !== undefined && !has("x-api-key")) entries.push(["x-api-key", apiKey]);
	} else if (apiKey !== undefined && !has("authorization")) {
		entries.push(["authorization", `Bearer ${apiKey}`]);
	}
	return Object.fromEntries(entries);
};

export const importModels = async (options: {
	api: ProviderApi;
	baseUrl: string;
	apiKey?: string;
	headers?: Record<string, string>;
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
		headers: authHeaders(options.api, options.apiKey, options.headers),
		signal: AbortSignal.timeout(TIMEOUT_MS),
		redirect: "error",
	});
	if (!response.ok) {
		throw new Error(`The model list answered ${response.status} ${response.statusText}`);
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
			models.push(entry.name === undefined ? { id: entry.id } : { id: entry.id, name: entry.name });
		}
		return models;
	} catch {
		throw new Error("The endpoint did not return a model list");
	}
};
