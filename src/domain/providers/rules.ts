import { ProviderApi } from "#protocol/settings/providers";

/**
 * The provider rules both sides run: which API families pi knows, and what a provider id
 * may look like. The server refuses a `models.json` entry that breaks them; the form
 * labels the choices with the same list.
 */

/** pi's API family names, from `docs/pi-sdk.md` and its own model clients. */
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
