/**
 * The model dialog's form, its seed, and the two payloads around it. Controls are
 * text inputs, so the form holds strings and these conversions own the parsing.
 *
 * An override names only the fields the operator changed. pi merges an override
 * field by field (`override.reasoning ?? model.reasoning`), so writing a field
 * with pi's catalog value pins it, and a written `reasoning: false` turns thinking
 * off on a model pi ships with reasoning on.
 */

import { parseProviderApi } from "shared";
import type { ProviderApi } from "shared";

import type { ModelOverride, ProviderModelInput } from "@/api/types";
import { reasoningFormOf, reasoningOf } from "./reasoning";
import type { ReasoningForm } from "./reasoning";

export type ModelForm = ReasoningForm & {
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	contextWindow: string;
	maxTokens: string;
	reasoning: boolean;
	images: boolean;
	costInput: string;
	costOutput: string;
	costCacheRead: string;
	costCacheWrite: string;
};

/**
 * The fields an override carries. The model id names the row, and pi's override
 * schema has no api or base URL, so none of the three is one.
 */
export type ModelField = Exclude<keyof ModelOverride, "api" | "baseUrl">;

/**
 * Which override field a form control edits. `id` is the row, and `api` and
 * `baseUrl` belong to a model entry and a provider, not to an override, so those
 * three map to null. The record's type keeps the list complete.
 */
const FIELD_OF_FORM: Readonly<Record<keyof ModelForm, ModelField | null>> = {
	id: null,
	name: "name",
	api: null,
	baseUrl: null,
	contextWindow: "contextWindow",
	maxTokens: "maxTokens",
	reasoning: "reasoning",
	images: "input",
	costInput: "cost",
	costOutput: "cost",
	costCacheRead: "cost",
	costCacheWrite: "cost",
	levels: "thinkingLevelMap",
	compat: "compat",
};

const optionalNumber = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const optionalCost = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** The four rates are one value: a partial cost is not written. */
const costOf = (form: ModelForm): ProviderModelInput["cost"] => {
	const input = optionalCost(form.costInput);
	const output = optionalCost(form.costOutput);
	const cacheRead = optionalCost(form.costCacheRead);
	const cacheWrite = optionalCost(form.costCacheWrite);
	return input !== undefined &&
		output !== undefined &&
		cacheRead !== undefined &&
		cacheWrite !== undefined
		? { input, output, cacheRead, cacheWrite }
		: undefined;
};

/**
 * The form a model opens with. An override's stored values win over the catalog's,
 * so reopening a dialog before the provider is saved keeps the operator's edits,
 * except its api and base URL: pi ignores both in an override, so the catalog's
 * effective pair applies.
 */
export const formOf = (
	model: ProviderModelInput | undefined,
	override?: ModelOverride,
): ModelForm => {
	const seed =
		model === undefined
			? undefined
			: {
					...model,
					...override,
					// pi ignores an api and base URL stored in an override, so the effective
					// ones are the catalog's; a legacy pair must not reach the probe.
					api: model.api,
					baseUrl: model.baseUrl,
				};
	return {
		id: seed?.id ?? "",
		name: seed?.name ?? "",
		api: seed?.api ?? "",
		baseUrl: seed?.baseUrl ?? "",
		contextWindow: seed?.contextWindow?.toString() ?? "",
		maxTokens: seed?.maxTokens?.toString() ?? "",
		reasoning: seed?.reasoning ?? false,
		images: seed?.input?.includes("image") ?? false,
		costInput: seed?.cost?.input.toString() ?? "",
		costOutput: seed?.cost?.output.toString() ?? "",
		costCacheRead: seed?.cost?.cacheRead.toString() ?? "",
		costCacheWrite: seed?.cost?.cacheWrite.toString() ?? "",
		...reasoningFormOf(seed),
	};
};

/** The form as a complete model. Save and Test share it, so they cannot drift. */
export const valueOf = (
	form: ModelForm,
	providerApi: ProviderApi | undefined,
): ProviderModelInput => {
	const api = parseProviderApi(form.api);
	return {
		id: form.id.trim(),
		name: form.name.trim() || undefined,
		api,
		baseUrl: form.baseUrl.trim() || undefined,
		reasoning: form.reasoning,
		input: form.images ? ["text", "image"] : undefined,
		contextWindow: optionalNumber(form.contextWindow),
		maxTokens: optionalNumber(form.maxTokens),
		cost: costOf(form),
		// A model that names no family still travels the provider's family.
		...reasoningOf(form, api ?? providerApi),
	};
};

/** The fields an edit touched, keeping the earlier ones. */
export const touchedBy = (
	current: ReadonlySet<ModelField>,
	patch: Partial<ModelForm>,
): ReadonlySet<ModelField> => {
	const next = new Set(current);
	for (const [key, field] of Object.entries(FIELD_OF_FORM)) {
		if (field !== null && Object.hasOwn(patch, key)) next.add(field);
	}
	return next;
};

/**
 * The override a save writes: the fields the operator changed, and nothing else.
 * A touched field with no value is left out, so pi keeps what it had; clearing a
 * stored override is the row's own "clear override" action.
 */
export const overrideOf = (
	model: ProviderModelInput,
	touched: ReadonlySet<ModelField>,
): ModelOverride => {
	const override: ModelOverride = {};
	if (touched.has("name") && model.name !== undefined) override.name = model.name;
	if (touched.has("reasoning") && model.reasoning !== undefined) {
		override.reasoning = model.reasoning;
	}
	// An unchecked box means text only; leaving the key out would keep pi's images.
	if (touched.has("input")) override.input = model.input ?? ["text"];
	if (touched.has("contextWindow") && model.contextWindow !== undefined) {
		override.contextWindow = model.contextWindow;
	}
	if (touched.has("maxTokens") && model.maxTokens !== undefined) {
		override.maxTokens = model.maxTokens;
	}
	if (touched.has("cost") && model.cost !== undefined) override.cost = model.cost;
	if (touched.has("thinkingLevelMap") && model.thinkingLevelMap !== undefined) {
		override.thinkingLevelMap = model.thinkingLevelMap;
	}
	if (touched.has("compat") && model.compat !== undefined) override.compat = model.compat;
	return override;
};
