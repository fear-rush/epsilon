import { ProviderApi } from "#protocol/settings/providers";

/**
 * The provider rules both sides run: which API families pi knows, and what a provider id
 * may look like. The server refuses a `models.json` entry that breaks them; the form
 * labels the choices with the same list.
 */

/** pi's API family names, from `docs/pi/README.md` and its own model clients. */
export const providerApis: ReadonlyArray<ProviderApi> = ProviderApi.literals;

export type { ProviderApi };

export const isProviderApi = (value: string): value is ProviderApi =>
	providerApis.some((api) => api === value);

/**
 * A provider id is a `models.json` key and a URL segment: letters, digits, dash and
 * underscore, and `new` names the add page, so it cannot also name a provider.
 */
export const isProviderId = (value: string): boolean =>
	/^(?!new$)[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);

/** What the form and the server say about an id that breaks the rule. */
export const PROVIDER_ID_PROBLEM = 'Use letters, digits, dashes and underscores; "new" is reserved';

/** The base URL a provider's client appends its family's path to: web, not a file or flag. */
export const isBaseUrl = (value: string): boolean => /^https?:\/\/[^\s]+$/.test(value);

/**
 * What pi appends to a provider's base URL for each API family, verified against the
 * clients pi uses (docs/pi/README.md). The API picker labels each family with its path, and
 * the model list knows where a compatible `/models` lives.
 */
export type ProviderApiInfo = {
	readonly id: ProviderApi;
	readonly label: string;
	/** Appended to the base URL by pi's client for this family. */
	readonly path: string;
	/** Where a compatible model list lives, or undefined when it differs or is absent. */
	readonly modelsPath?: string;
};

/** Every family's label and paths, keyed so a family this file forgets cannot compile. */
const API_INFO: Readonly<Record<ProviderApi, Omit<ProviderApiInfo, "id">>> = {
	"anthropic-messages": {
		label: "Anthropic Messages",
		modelsPath: "/v1/models",
		path: "/v1/messages",
	},
	"google-generative-ai": {
		label: "Google Generative AI",
		path: "/models/{model}:generateContent",
	},
	"openai-completions": {
		label: "OpenAI Chat Completions",
		modelsPath: "/models",
		path: "/chat/completions",
	},
	"openai-responses": { label: "OpenAI Responses", modelsPath: "/models", path: "/responses" },
};

/** One family's row, the id first so the picker's value is always the schema's literal. */
const infoOf = (id: ProviderApi): ProviderApiInfo => Object.assign({ id }, API_INFO[id]);

/** The same table in pi's own family order, which is the order the picker shows. */
export const providerApiInfos: ReadonlyArray<ProviderApiInfo> = providerApis.map(infoOf);

/** The picker's label and paths for a family, or undefined when it names none. */
export const providerApiInfo = (api: ProviderApi): ProviderApiInfo | undefined =>
	providerApiInfos.find((entry) => entry.id === api);

const withoutTrailingSlash = (baseUrl: string): string => baseUrl.replace(/\/+$/u, "");

/** The model-list endpoint, when this family exposes one in the shared shape. */
export const providerModelsEndpoint = (api: ProviderApi, baseUrl: string): string | undefined => {
	const modelsPath = providerApiInfo(api)?.modelsPath;
	if (modelsPath === undefined) return undefined;
	return `${withoutTrailingSlash(baseUrl.trim())}${modelsPath}`;
};

export type ProviderBaseUrlProblem = {
	/** The trailing path the base repeats, such as "/v1". */
	readonly repeated: string;
	/** The base with that path removed. */
	readonly suggestion: string;
};

/**
 * A base URL that already ends in the path its family appends, which pi's clients
 * concatenate rather than resolve. `https://host/provider/v1` plus Anthropic's
 * `/v1/messages` becomes `/provider/v1/v1/messages`.
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
	const firstSegment = info.path.split("/").find((segment) => segment !== "");
	const lastSlash = base.lastIndexOf("/");
	if (firstSegment === undefined || lastSlash < 0) return undefined;
	if (base.slice(lastSlash + 1) !== firstSegment) return undefined;
	const suggestion = base.slice(0, lastSlash);
	// A scheme alone is not a base URL, so there is nothing useful to suggest.
	if (!suggestion.includes("://") || suggestion.endsWith("://")) return undefined;
	return { repeated: `/${firstSegment}`, suggestion };
};
