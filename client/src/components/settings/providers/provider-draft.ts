/**
 * The editable state of one provider, and the two conversions around it: from
 * the detail the server sends, and back to the write-shaped input. A blank
 * secret field means "keep", an empty header value means "keep that header".
 */
import { providerApiSchema } from "shared";
import type { ModelOverride, ProviderDetail, ProviderInput, ProviderModelInput } from "shared";

/**
 * Base UI's Select reads the empty string as "nothing selected", so the row that
 * means "use the provider's API" needs a value of its own.
 */
export const providerApiUnset = "provider-api-unset";

export type HeaderRow = {
	key: string;
	value: string;
	/** The value is stored on the server and was not sent to this page. */
	stored: boolean;
};

export type ProviderDraft = {
	id: string;
	name: string;
	baseUrl: string;
	api: string;
	apiKey: string;
	headers: HeaderRow[];
	models: ProviderModelInput[];
	modelOverrides: Record<string, ModelOverride>;
	/** False keeps pi's catalog for a provider pi ships. */
	customCatalog: boolean;
};

export const draftOf = (detail: ProviderDetail | undefined): ProviderDraft => {
	const stored = detail?.custom === true;
	return {
		id: detail?.id ?? "",
		// A built-in with no entry gets empty fields, so saving a key does not pin
		// pi's inherited name, endpoint or API.
		name: stored ? (detail.stored.name ?? (detail.builtin ? "" : detail.name)) : "",
		baseUrl: stored ? (detail.stored.baseUrl ?? "") : "",
		api: stored ? (detail.stored.api ?? "") : "",
		apiKey: "",
		headers: (detail?.headerKeys ?? []).map((key) => ({ key, value: "", stored: true })),
		models: detail?.models ?? [],
		modelOverrides: detail?.modelOverrides ?? {},
		customCatalog: detail === undefined ? true : !detail.builtin || detail.models.length > 0,
	};
};

/** A blank key or header value keeps the stored one; the server applies that. */
export const inputOf = (draft: ProviderDraft, builtin: boolean): ProviderInput => {
	const api = providerApiSchema.safeParse(draft.api);
	return {
		id: draft.id.trim(),
		name: draft.name.trim() || undefined,
		baseUrl: draft.baseUrl.trim(),
		api: api.success ? api.data : undefined,
		apiKey: draft.apiKey.trim() || undefined,
		headers: Object.fromEntries(
			draft.headers
				// A blank value keeps a stored header; it never creates one.
				.filter((row) => row.key.trim() !== "" && (row.value.trim() !== "" || row.stored))
				.map((row) => [row.key.trim(), row.value]),
		),
		models: !builtin || draft.customCatalog ? draft.models : undefined,
		modelOverrides: draft.modelOverrides,
	};
};
