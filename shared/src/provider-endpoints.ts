/**
 * What pi appends to a provider's base URL for each API family, verified against
 * the clients pi uses (docs/reference/pi-sdk.md). The API picker labels each family
 * with its path, and the model list knows where a compatible `/models` lives.
 */
import type { ProviderApi } from "./schemas/settings";

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

const withoutTrailingSlash = (baseUrl: string): string => baseUrl.replace(/\/+$/u, "");

const apiInfo = (api: ProviderApi): ProviderApiInfo | undefined =>
	PROVIDER_APIS.find((entry) => entry.id === api);

/** The model-list endpoint, when this family exposes one in the shared shape. */
export const providerModelsEndpoint = (api: ProviderApi, baseUrl: string): string | undefined => {
	const modelsPath = apiInfo(api)?.modelsPath;
	if (modelsPath === undefined) return undefined;
	return `${withoutTrailingSlash(baseUrl.trim())}${modelsPath}`;
};
