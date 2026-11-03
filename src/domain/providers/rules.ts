/**
 * The provider rules both sides run: which API families pi knows, and what a provider id
 * may look like. The server refuses a `models.json` entry that breaks them; the form
 * labels the choices with the same list.
 */

/** pi's API family names, from `docs/pi-sdk.md` and its own model clients. */
export const providerApis = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;

export type ProviderApi = (typeof providerApis)[number];

export const isProviderApi = (value: string): value is ProviderApi =>
	providerApis.some((api) => api === value);

/** A provider id is a `models.json` key: letters, digits, dot, dash and underscore. */
export const isProviderId = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

/** The base URL a provider's client appends its family's path to: web, not a file or flag. */
export const isBaseUrl = (value: string): boolean => /^https?:\/\/[^\s]+$/.test(value);
