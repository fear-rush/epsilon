import { Option, Schema } from "effect";

import { isProviderApi } from "#domain/providers/rules";
import type { ProviderApi } from "#domain/providers/rules";
import {
	ProviderModelCostTier as CostTierSchema,
	SamplingParams as SamplingParamsSchema,
	SamplingParamsByThinkingLevel as SamplingByLevelSchema,
} from "#protocol/settings/providers";
import type {
	ModelOverride,
	ModelOverrideCost,
	ModelPromptCache,
	ProviderModelCostTier,
	ProviderModelInput,
	SamplingParams,
	SamplingParamsByThinkingLevel,
} from "#protocol/settings/providers";
import type { PairRow } from "@/components/patterns/section/pair-rows";

import { THINKING_LEVELS, reasoningFormOf, reasoningOf } from "./reasoning";
import type { ReasoningForm } from "./reasoning";

/**
 * The model dialog's form, its seed, and the two payloads around it. Controls are
 * text inputs, so the form holds strings and these conversions own the parsing.
 *
 * An override names only the fields the operator changed. pi merges an override
 * field by field (`override.reasoning ?? model.reasoning`), so writing a field
 * with pi's catalog value pins it, and a written `reasoning: false` turns thinking
 * off on a model pi ships with reasoning on.
 *
 * The seed is pi's effective model, with the stored override merged back in for
 * the fields the operator has not saved yet. Nested blocks merge the way pi merges
 * them (`inputLimits` down to the resize profile), so a partial override never
 * hides the catalog's values.
 */

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
	costTiers: string;
	headerRows: PairRow[];
	maxRequestBytes: string;
	imageResizeWidth: string;
	imageResizeHeight: string;
	imageResizeBytes: string;
	imageJpegQuality: string;
	imageMaxPerMessage: string;
	imageMaxPerRequest: string;
	promptCacheShort: string;
	promptCacheLong: string;
	samplingParams: string;
	samplingParamsByLevel: string;
};

/**
 * The fields an override carries. The model id names the row, and pi's override
 * schema has no api or base URL, so none of the three is one.
 */
export type ModelField = Exclude<keyof ModelOverride, "api" | "baseUrl">;

/** A model entry owns its four cost rates; an override may name only some. */
export type ModelValue = Omit<ProviderModelInput, "cost"> & { cost?: ModelOverride["cost"] };

/** Which dialog this is: a model entry, or an override of one pi ships. */
export type ModelMode = "model" | "override";

type InputLimits = NonNullable<ProviderModelInput["inputLimits"]>;
type ImageLimits = NonNullable<InputLimits["images"]>;
type ImageResize = NonNullable<ImageLimits["resize"]>;
type CostTiers = ReadonlyArray<ProviderModelCostTier>;

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
	costTiers: "cost",
	headerRows: "headers",
	maxRequestBytes: "inputLimits",
	imageResizeWidth: "inputLimits",
	imageResizeHeight: "inputLimits",
	imageResizeBytes: "inputLimits",
	imageJpegQuality: "inputLimits",
	imageMaxPerMessage: "inputLimits",
	imageMaxPerRequest: "inputLimits",
	promptCacheShort: "promptCache",
	promptCacheLong: "promptCache",
	samplingParams: "samplingParams",
	samplingParamsByLevel: "samplingParamsByThinkingLevel",
	levels: "thinkingLevelMap",
	compat: "compat",
};

const optionalNumber = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const optionalInteger = (value: string): number | undefined => {
	const parsed = Number(value);
	return /^\d+$/u.test(value.trim()) && parsed > 0 ? parsed : undefined;
};

const optionalCost = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** A schema's struct type with its fields writable, for a payload built a field at a time. */
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

/** Each JSON control decodes through the schema its block is written with. */
const decodeSamplingParams = Schema.decodeUnknownOption(
	Schema.fromJsonString(SamplingParamsSchema),
);
const decodeSamplingByLevel = Schema.decodeUnknownOption(
	Schema.fromJsonString(SamplingByLevelSchema),
);
const decodeCostTiers = Schema.decodeUnknownOption(
	Schema.fromJsonString(Schema.Array(CostTierSchema)),
);

/**
 * The JSON text as the schema's value. A blank control and text that does not parse
 * both give undefined, so a half-typed block never reaches the payload or the error list.
 */
export const readJson = <Value>(
	decode: (text: string) => Option.Option<Value>,
	text: string,
): Value | undefined => (text.trim() === "" ? undefined : Option.getOrUndefined(decode(text)));

/** The blocks a form control holds as JSON text. */
type JsonBlock = CostTiers | SamplingParams | SamplingParamsByThinkingLevel;

const jsonText = (value: JsonBlock | undefined): string =>
	value === undefined ? "" : JSON.stringify(value, null, 2);

const withValue = <Target extends object, Key extends keyof Target>(
	target: Target,
	key: Key,
	value: Target[Key] | undefined,
): void => {
	if (value !== undefined) target[key] = value;
};

const merged = <Value extends object>(
	base: Value | undefined,
	override: Value | undefined,
): Value | undefined => {
	if (override === undefined) return base;
	if (base === undefined) return override;
	return Object.assign({}, base, override);
};

const mergedLimits = (
	base: InputLimits | undefined,
	override: InputLimits | undefined,
): InputLimits | undefined => {
	if (override === undefined) return base;
	if (base === undefined) return override;
	return {
		...base,
		...override,
		images:
			override.images === undefined
				? base.images
				: {
						...base.images,
						...override.images,
						resize:
							override.images.resize === undefined
								? base.images?.resize
								: Object.assign({}, base.images?.resize, override.images.resize),
					},
	};
};

const mergedByLevel = (
	base: SamplingParamsByThinkingLevel | undefined,
	override: SamplingParamsByThinkingLevel | undefined,
): SamplingParamsByThinkingLevel | undefined => {
	if (override === undefined) return base;
	if (base === undefined) return override;
	const next = { ...base };
	for (const level of THINKING_LEVELS) {
		const params = override[level];
		if (params !== undefined) next[level] = Object.assign({}, base[level], params);
	}
	return next;
};

const seedOf = (
	model: ProviderModelInput | undefined,
	override: ModelOverride | undefined,
): ModelValue | undefined => {
	if (model === undefined) return undefined;
	if (override === undefined) return model;
	return {
		...model,
		...override,
		// pi ignores an api and base URL stored in an override.
		api: model.api,
		baseUrl: model.baseUrl,
		thinkingLevelMap: merged(model.thinkingLevelMap, override.thinkingLevelMap),
		compat: merged(model.compat, override.compat),
		inputLimits: mergedLimits(model.inputLimits, override.inputLimits),
		promptCache: merged(model.promptCache, override.promptCache),
		samplingParams: merged(model.samplingParams, override.samplingParams),
		samplingParamsByThinkingLevel: mergedByLevel(
			model.samplingParamsByThinkingLevel,
			override.samplingParamsByThinkingLevel,
		),
		cost: merged<NonNullable<ModelOverride["cost"]>>(model.cost, override.cost),
		headers: merged(model.headers, override.headers),
	};
};

const rowsOf = (headers: Record<string, string> | undefined): PairRow[] =>
	Object.entries(headers ?? {}).map(([key, value]) => ({ key, value, stored: value === "" }));

const headersOf = (rows: PairRow[]): Record<string, string> | undefined => {
	const entries = rows
		.filter((row) => row.key.trim() !== "")
		.map((row) => [row.key.trim(), row.value] as const);
	return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const limitsOf = (form: ModelForm): InputLimits | undefined => {
	const resize: Mutable<ImageResize> = {};
	withValue(resize, "maxWidth", optionalInteger(form.imageResizeWidth));
	withValue(resize, "maxHeight", optionalInteger(form.imageResizeHeight));
	withValue(resize, "maxBytes", optionalInteger(form.imageResizeBytes));
	withValue(resize, "jpegQuality", optionalInteger(form.imageJpegQuality));
	const images: Mutable<ImageLimits> = {};
	if (Object.keys(resize).length > 0) images.resize = resize;
	withValue(images, "maxPerMessage", optionalInteger(form.imageMaxPerMessage));
	withValue(images, "maxPerRequest", optionalInteger(form.imageMaxPerRequest));
	const limits: Mutable<InputLimits> = {};
	withValue(limits, "maxRequestBytes", optionalInteger(form.maxRequestBytes));
	if (Object.keys(images).length > 0) limits.images = images;
	return Object.keys(limits).length > 0 ? limits : undefined;
};

const promptCacheOf = (form: ModelForm): ModelPromptCache | undefined => {
	const cache: Mutable<ModelPromptCache> = {};
	withValue(cache, "short", optionalNumber(form.promptCacheShort));
	withValue(cache, "long", optionalNumber(form.promptCacheLong));
	return Object.keys(cache).length > 0 ? cache : undefined;
};

/** The three JSON controls' readers, shared with the form's own validation. */
export const parseSamplingParams = (text: string): SamplingParams | undefined =>
	readJson(decodeSamplingParams, text);

export const parseSamplingByLevel = (text: string): SamplingParamsByThinkingLevel | undefined =>
	readJson(decodeSamplingByLevel, text);

export const parseCostTiers = (text: string): CostTiers | undefined =>
	readJson(decodeCostTiers, text);

const samplingParamsOf = (text: string): SamplingParams | undefined => {
	const params = parseSamplingParams(text);
	return params !== undefined && Object.keys(params).length > 0 ? params : undefined;
};

const samplingByLevelOf = (text: string): SamplingParamsByThinkingLevel | undefined => {
	const params = parseSamplingByLevel(text);
	return params !== undefined && Object.keys(params).length > 0 ? params : undefined;
};

const costTiersOf = (text: string): CostTiers | undefined => {
	const tiers = parseCostTiers(text);
	return tiers !== undefined && tiers.length > 0 ? tiers : undefined;
};

/** The rates and tiers the form names. An override may name only some rates. */
const costOf = (form: ModelForm): ModelOverrideCost | undefined => {
	const cost: Mutable<ModelOverrideCost> = {};
	withValue(cost, "input", optionalCost(form.costInput));
	withValue(cost, "output", optionalCost(form.costOutput));
	withValue(cost, "cacheRead", optionalCost(form.costCacheRead));
	withValue(cost, "cacheWrite", optionalCost(form.costCacheWrite));
	const tiers = costTiersOf(form.costTiers);
	if (tiers !== undefined) cost.tiers = tiers;
	return Object.keys(cost).length > 0 ? cost : undefined;
};

/** The form a model opens with, seeded from pi's effective model and the draft override. */
export const formOf = (
	model: ProviderModelInput | undefined,
	override?: ModelOverride,
): ModelForm => {
	const seed = seedOf(model, override);
	const resize = seed?.inputLimits?.images?.resize;
	return {
		id: seed?.id ?? "",
		name: seed?.name ?? "",
		api: seed?.api ?? "",
		baseUrl: seed?.baseUrl ?? "",
		contextWindow: seed?.contextWindow?.toString() ?? "",
		maxTokens: seed?.maxTokens?.toString() ?? "",
		reasoning: seed?.reasoning ?? false,
		images: seed?.input?.includes("image") ?? false,
		costInput: seed?.cost?.input?.toString() ?? "",
		costOutput: seed?.cost?.output?.toString() ?? "",
		costCacheRead: seed?.cost?.cacheRead?.toString() ?? "",
		costCacheWrite: seed?.cost?.cacheWrite?.toString() ?? "",
		costTiers: jsonText(seed?.cost?.tiers),
		headerRows: rowsOf(seed?.headers),
		maxRequestBytes: seed?.inputLimits?.maxRequestBytes?.toString() ?? "",
		imageResizeWidth: resize?.maxWidth?.toString() ?? "",
		imageResizeHeight: resize?.maxHeight?.toString() ?? "",
		imageResizeBytes: resize?.maxBytes?.toString() ?? "",
		imageJpegQuality: resize?.jpegQuality?.toString() ?? "",
		imageMaxPerMessage: seed?.inputLimits?.images?.maxPerMessage?.toString() ?? "",
		imageMaxPerRequest: seed?.inputLimits?.images?.maxPerRequest?.toString() ?? "",
		promptCacheShort: seed?.promptCache?.short?.toString() ?? "",
		promptCacheLong: seed?.promptCache?.long?.toString() ?? "",
		samplingParams: jsonText(seed?.samplingParams),
		samplingParamsByLevel: jsonText(seed?.samplingParamsByThinkingLevel),
		...reasoningFormOf(seed),
	};
};

/** The form as the dialog's value. A model entry is validated before it is saved. */
export const valueOf = (form: ModelForm, providerApi: ProviderApi | undefined): ModelValue => {
	const api = isProviderApi(form.api) ? form.api : undefined;
	return {
		id: form.id.trim(),
		name: form.name.trim() || undefined,
		api,
		baseUrl: form.baseUrl.trim() || undefined,
		reasoning: form.reasoning,
		input: form.images ? ["text", "image"] : undefined,
		inputLimits: limitsOf(form),
		promptCache: promptCacheOf(form),
		samplingParams: samplingParamsOf(form.samplingParams),
		samplingParamsByThinkingLevel: samplingByLevelOf(form.samplingParamsByLevel),
		headers: headersOf(form.headerRows),
		contextWindow: optionalNumber(form.contextWindow),
		maxTokens: optionalNumber(form.maxTokens),
		cost: costOf(form),
		// A model that names no family still travels the provider's family.
		...reasoningOf(form, api ?? providerApi),
	};
};

/**
 * The value as a model entry, after the dialog validated it. pi's model definition
 * needs all four rates, and `modelFieldErrors` enforces that for this mode.
 */
export const completeModelOf = (model: ModelValue): ProviderModelInput => {
	const cost = model.cost;
	// `modelFieldErrors` allows a model with no rates at all: `models.json` omits `cost`
	// for one, and pi prices it as free. Only a partly filled set is a bug.
	if (
		cost?.input === undefined &&
		cost?.output === undefined &&
		cost?.cacheRead === undefined &&
		cost?.cacheWrite === undefined
	) {
		const { cost: _omitted, ...rest } = model;
		return rest;
	}
	if (
		cost.input === undefined ||
		cost.output === undefined ||
		cost.cacheRead === undefined ||
		cost.cacheWrite === undefined
	) {
		throw new Error("A model entry needs all four cost rates, or none of them.");
	}
	const complete: Mutable<NonNullable<ProviderModelInput["cost"]>> = {
		cacheRead: cost.cacheRead,
		cacheWrite: cost.cacheWrite,
		input: cost.input,
		output: cost.output,
	};
	if (cost.tiers !== undefined) complete.tiers = cost.tiers;
	return { ...model, cost: complete };
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
export const overrideOf = (model: ModelValue, touched: ReadonlySet<ModelField>): ModelOverride => {
	const override: Mutable<ModelOverride> = {};
	if (touched.has("name") && model.name !== undefined) override.name = model.name;
	if (touched.has("reasoning") && model.reasoning !== undefined) {
		override.reasoning = model.reasoning;
	}
	// An unchecked box means text only; leaving the key out would keep pi's images.
	if (touched.has("input")) override.input = model.input ?? ["text"];
	if (touched.has("inputLimits") && model.inputLimits !== undefined) {
		override.inputLimits = model.inputLimits;
	}
	if (touched.has("promptCache") && model.promptCache !== undefined) {
		override.promptCache = model.promptCache;
	}
	if (touched.has("samplingParams") && model.samplingParams !== undefined) {
		override.samplingParams = model.samplingParams;
	}
	if (
		touched.has("samplingParamsByThinkingLevel") &&
		model.samplingParamsByThinkingLevel !== undefined
	) {
		override.samplingParamsByThinkingLevel = model.samplingParamsByThinkingLevel;
	}
	// Removing every row is an answer: the override carries no headers, so pi's
	// model definition applies again.
	if (touched.has("headers")) override.headers = model.headers ?? {};
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
