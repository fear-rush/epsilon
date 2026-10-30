/**
 * The editable state of one provider, and the two conversions around it: from
 * the detail the server sends, and back to the write-shaped input. A blank
 * secret field means "keep", an empty header value means "keep that header".
 */
import { parseProviderApi } from "shared";
import type { PairRow } from "@/components/settings/pair-rows";

import { compatForApi } from "./reasoning";
import type {
	ModelOverride,
	ProviderDetail,
	ProviderInput,
	ProviderModelInput,
	ProviderTestInput,
	ReasoningCompat,
} from "shared";

/**
 * Base UI's Select reads the empty string as "nothing selected", so the row that
 * means "use the provider's API" needs a value of its own.
 */
export const providerApiUnset = "provider-api-unset";

export type ProviderDraft = {
	id: string;
	name: string;
	baseUrl: string;
	api: string;
	apiKey: string;
	headers: PairRow[];
	/** Provider-wide reasoning format; each model's compat overrides it. */
	compat: ReasoningCompat;
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
		compat: detail?.stored.compat ?? {},
		models: detail?.models ?? [],
		modelOverrides: detail?.modelOverrides ?? {},
		customCatalog: detail === undefined ? true : !detail.builtin || detail.models.length > 0,
	};
};

/**
 * A blank key or header value keeps the stored one; the server applies that. The
 * name, base URL and API are the fields the form shows, so an empty one clears
 * the stored value instead of keeping it.
 */
export const inputOf = (draft: ProviderDraft, builtin: boolean): ProviderInput => {
	const api = parseProviderApi(draft.api);
	return {
		id: draft.id.trim(),
		name: draft.name.trim(),
		baseUrl: draft.baseUrl.trim(),
		api: api ?? "",
		apiKey: draft.apiKey.trim() || undefined,
		compat: compatForApi(draft.compat, api),
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

/** The draft in the shape the test route reads, with one model to try. */
export const testInputOf = (
	draft: ProviderDraft,
	model: ProviderModelInput | undefined,
	level?: ProviderTestInput["level"],
): ProviderTestInput => ({
	providerId: draft.id.trim() || undefined,
	name: draft.name.trim() || undefined,
	baseUrl: draft.baseUrl.trim(),
	api: parseProviderApi(draft.api),
	apiKey: draft.apiKey.trim() || undefined,
	headers: Object.fromEntries(
		draft.headers.filter((row) => row.key.trim() !== "").map((row) => [row.key.trim(), row.value]),
	),
	compat: compatForApi(draft.compat, parseProviderApi(draft.api)),
	level,
	model,
});
