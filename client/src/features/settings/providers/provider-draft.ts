import { parseProviderApi } from "shared";

import type { PairRow } from "@/features/settings/kit/pair-rows";
import { compatForApi } from "./reasoning";
import type {
	ModelOverride,
	ProviderDetail,
	ProviderInput,
	ProviderModelInput,
	ProviderTestInput,
	ReasoningCompat,
} from "@/api/types";

/**
 * The editable state of one provider, and the two conversions around it: from
 * the detail the server sends, and back to the write-shaped input. A blank
 * secret field means "keep", an empty header value means "keep that header".
 */

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

/**
 * A provider id derived from its display name. pi's rule is a leading letter or
 * digit, then letters, digits, dashes and underscores, and "new" is reserved by
 * the add route. The id is the `models.json` key and the address models use, so
 * it is generated once for a new provider and never follows a later rename.
 */
const MAX_LENGTH = 40;

export const providerIdFromName = (name: string): string => {
	const ascii = name.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "");
	const slug = ascii
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/gu, "-")
		.replace(/-{2,}/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, MAX_LENGTH)
		.replace(/-+$/gu, "");
	if (slug === "") return "provider";
	return slug === "new" ? "new-provider" : slug;
};

/** The first free id, so a name matching a provider pi ships does not edit it. */
export const uniqueProviderId = (base: string, taken: ReadonlySet<string>): string => {
	if (base === "" || !taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
};

/** Lowercased display names already in use, excluding the provider being edited. */
export const providerNamesInUse = (
	providers: readonly { id: string; name: string }[],
	builtins: readonly { id: string; name: string }[],
	excludeId: string | undefined,
): Set<string> => {
	const names = new Set<string>();
	for (const provider of [...providers, ...builtins]) {
		if (provider.id !== excludeId) names.add(provider.name.trim().toLowerCase());
	}
	return names;
};
