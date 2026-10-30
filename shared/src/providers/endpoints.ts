/**
 * What pi appends to a provider's base URL for each API family, verified against
 * the clients pi uses (docs/pi-sdk.md). The API picker labels each family
 * with its path, and the model list knows where a compatible `/models` lives.
 */
import { providerApiSchema } from "./rules";
import type { ProviderApi } from "./rules";

export type ProviderApiInfo = {
	id: ProviderApi;
	label: string;
	/** Appended to the base URL by pi's client for this family. */
	path: string;
	/** Where a compatible model list lives, or undefined when it differs. */
	modelsPath?: string;
};

export const PROVIDER_APIS: readonly ProviderApiInfo[] = [
	{
		id: "openai-completions",
		label: "OpenAI Chat Completions",
		path: "/chat/completions",
		modelsPath: "/models",
	},
	{
		id: "openai-responses",
		label: "OpenAI Responses",
		path: "/responses",
		modelsPath: "/models",
	},
	{
		id: "anthropic-messages",
		label: "Anthropic Messages",
		path: "/v1/messages",
		modelsPath: "/v1/models",
	},
	{
		id: "google-generative-ai",
		label: "Google Generative AI",
		path: "/models/{model}:generateContent",
	},
];

/** The API family a stored string names, or undefined when it names none. */
export const parseProviderApi = (value: string): ProviderApi | undefined => {
	const parsed = providerApiSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
};

const withoutTrailingSlash = (baseUrl: string): string => baseUrl.replace(/\/+$/u, "");

/** The picker's label and paths for a family, or undefined when it names none. */
export const providerApiInfo = (api: ProviderApi): ProviderApiInfo | undefined =>
	PROVIDER_APIS.find((entry) => entry.id === api);

/** The request URL pi's client composes, when this family names a path. */
export const providerEndpoint = (api: ProviderApi, baseUrl: string): string | undefined => {
	const path = providerApiInfo(api)?.path;
	if (path === undefined) return undefined;
	return `${withoutTrailingSlash(baseUrl.trim())}${path}`;
};

/** The model-list endpoint, when this family exposes one in the shared shape. */
export const providerModelsEndpoint = (api: ProviderApi, baseUrl: string): string | undefined => {
	const modelsPath = providerApiInfo(api)?.modelsPath;
	if (modelsPath === undefined) return undefined;
	return `${withoutTrailingSlash(baseUrl.trim())}${modelsPath}`;
};

export type ProviderBaseUrlProblem = {
	/** The trailing path the base repeats, such as "/v1". */
	repeated: string;
	/** The base with that path removed. */
	suggestion: string;
};

/**
 * A base URL that already ends in the path its family appends, which pi's clients
 * concatenate rather than resolve. `https://host/provider/v1` plus Anthropic's
 * `/v1/messages` becomes `/provider/v1/v1/messages` (docs/DECISIONS.md, Configure in the dashboard).
 */
export const providerBaseUrlProblem = (
	api: ProviderApi,
	baseUrl: string,
): ProviderBaseUrlProblem | undefined => {
	const info = providerApiInfo(api);
	const base = withoutTrailingSlash(baseUrl.trim());
	if (info === undefined || base === "") return undefined;
	// A pasted request or model-list endpoint, which the client would append to again.
	const appended = [info.path, info.modelsPath].find(
		(path) => path !== undefined && base.endsWith(path) && base.length > path.length,
	);
	if (appended !== undefined) {
		return { repeated: appended, suggestion: base.slice(0, -appended.length) };
	}
	const firstSegment = info.path.split("/").filter(Boolean)[0];
	const lastSlash = base.lastIndexOf("/");
	if (firstSegment === undefined || lastSlash < 0) return undefined;
	if (base.slice(lastSlash + 1) !== firstSegment) return undefined;
	const suggestion = base.slice(0, lastSlash);
	// A scheme alone is not a base URL, so there is nothing useful to suggest.
	if (!suggestion.includes("://") || suggestion.endsWith("://")) return undefined;
	return { repeated: `/${firstSegment}`, suggestion };
};
