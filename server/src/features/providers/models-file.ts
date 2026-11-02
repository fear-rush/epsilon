/**
 * The `models.json` shape the dashboard edits. pi ships no writer for this file,
 * so the documented fields live in loose zod objects: unknown keys stay on every
 * object, and a write never drops a block this version does not model (docs/DECISIONS.md, Configure in the dashboard).
 */
import { z } from "zod";
import { parseProviderApi } from "shared";

import { mergeSecrets, setOrDelete } from "../../platform/patch";
import type {
	ModelOverride,
	ProviderModelInput,
	ReasoningCompat,
	ThinkingLevelMap,
} from "./contract";
import { reasoningCompatSchema, thinkingLevelMapSchema } from "./contract";

const storedCostTierSchema = z.looseObject({
	inputTokensAbove: z.number(),
	input: z.number(),
	output: z.number(),
	cacheRead: z.number(),
	cacheWrite: z.number(),
});

const storedCostSchema = z.looseObject({
	input: z.number(),
	output: z.number(),
	cacheRead: z.number(),
	cacheWrite: z.number(),
	tiers: z.array(storedCostTierSchema).optional(),
});

/** pi merges an override's cost per field, so the file may hold only some rates. */
const storedPartialCostSchema = storedCostSchema.partial();

/** Nested blocks are loose too: a key this version does not model survives a write. */
const storedInputLimitsSchema = z.looseObject({
	maxRequestBytes: z.number().optional(),
	images: z
		.looseObject({
			resize: z
				.looseObject({
					maxWidth: z.number().optional(),
					maxHeight: z.number().optional(),
					maxBytes: z.number().optional(),
					jpegQuality: z.number().optional(),
				})
				.optional(),
			maxPerMessage: z.number().optional(),
			maxPerRequest: z.number().optional(),
		})
		.optional(),
});

const storedPromptCacheSchema = z.looseObject({
	short: z.number().optional(),
	long: z.number().optional(),
});

const storedSamplingParamsSchema = z.record(z.string(), z.unknown());

const storedSamplingByLevelSchema = z.looseObject({
	off: storedSamplingParamsSchema.optional(),
	minimal: storedSamplingParamsSchema.optional(),
	low: storedSamplingParamsSchema.optional(),
	medium: storedSamplingParamsSchema.optional(),
	high: storedSamplingParamsSchema.optional(),
	xhigh: storedSamplingParamsSchema.optional(),
	max: storedSamplingParamsSchema.optional(),
});

const storedModelSchema = z.looseObject({
	id: z.string(),
	name: z.string().optional(),
	api: z.string().optional(),
	baseUrl: z.string().optional(),
	reasoning: z.boolean().optional(),
	thinkingLevelMap: thinkingLevelMapSchema.optional(),
	compat: reasoningCompatSchema.optional(),
	input: z.array(z.string()).optional(),
	inputLimits: storedInputLimitsSchema.optional(),
	promptCache: storedPromptCacheSchema.optional(),
	samplingParams: storedSamplingParamsSchema.optional(),
	samplingParamsByThinkingLevel: storedSamplingByLevelSchema.optional(),
	headers: z.record(z.string(), z.string()).optional(),
	contextWindow: z.number().optional(),
	maxTokens: z.number().optional(),
	cost: storedCostSchema.optional(),
});

const storedOverrideSchema = storedModelSchema
	.omit({ id: true })
	.extend({ cost: storedPartialCostSchema.optional() });

const providerEntrySchema = z.looseObject({
	name: z.string().optional(),
	baseUrl: z.string().optional(),
	api: z.string().optional(),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	compat: reasoningCompatSchema.optional(),
	authHeader: z.boolean().optional(),
	oauth: z.literal("radius").optional(),
	models: z.array(storedModelSchema).optional(),
	modelOverrides: z.record(z.string(), storedOverrideSchema).optional(),
});

export const modelsFileSchema = z.looseObject({
	providers: z.record(z.string(), providerEntrySchema).optional(),
});

export type ModelsFile = z.infer<typeof modelsFileSchema>;
export type ProviderEntry = z.infer<typeof providerEntrySchema>;
export type StoredModel = z.infer<typeof storedModelSchema>;

/** The complete cost a model definition needs. */
type CompleteCost = NonNullable<ProviderModelInput["cost"]>;

/** The editable fields, without the loose index signature Omit would keep. */
export type StoredFields = {
	name?: string;
	api?: string;
	baseUrl?: string;
	reasoning?: boolean;
	thinkingLevelMap?: ThinkingLevelMap;
	compat?: ReasoningCompat;
	input?: string[];
	inputLimits?: NonNullable<ModelOverride["inputLimits"]>;
	promptCache?: NonNullable<ModelOverride["promptCache"]>;
	samplingParams?: NonNullable<ModelOverride["samplingParams"]>;
	samplingParamsByThinkingLevel?: NonNullable<ModelOverride["samplingParamsByThinkingLevel"]>;
	headers?: Record<string, string>;
	contextWindow?: number;
	maxTokens?: number;
	cost?: NonNullable<ModelOverride["cost"]>;
};

/** The API family a stored entry names, or undefined when it names none. */
export const apiOf = (entry: { api?: string } | undefined): ModelOverride["api"] =>
	parseProviderApi(entry?.api ?? "");

/** Everything both a model entry and an override carry, except the cost. */
const sharedFieldsOf = (model: StoredFields): Omit<ModelOverride, "cost"> => ({
	name: model.name,
	api: parseProviderApi(model.api ?? ""),
	baseUrl: model.baseUrl,
	reasoning: model.reasoning,
	thinkingLevelMap: model.thinkingLevelMap,
	compat: model.compat,
	input: model.input?.filter(
		(kind): kind is "text" | "image" => kind === "text" || kind === "image",
	),
	inputLimits: model.inputLimits,
	promptCache: model.promptCache,
	samplingParams: model.samplingParams,
	samplingParamsByThinkingLevel: model.samplingParamsByThinkingLevel,
	// Header values stay on the server, like a provider's; the keys seed the editor.
	headers:
		model.headers === undefined
			? undefined
			: Object.fromEntries(Object.keys(model.headers).map((key) => [key, ""])),
	contextWindow: model.contextWindow,
	maxTokens: model.maxTokens,
});

/** The editable fields of a model entry or a catalog model, whose cost is complete. */
export const fieldsOf = (
	model: StoredFields & { cost?: CompleteCost },
): Omit<ProviderModelInput, "id"> => ({
	...sharedFieldsOf(model),
	cost: model.cost,
});

/** The editable fields of an override, whose cost may name only some rates. */
export const overrideFieldsOf = (model: StoredFields): ModelOverride => ({
	...sharedFieldsOf(model),
	cost: model.cost,
});

export const baseUrlOf = (
	entry: ProviderEntry | undefined,
	provider: { baseUrl?: string } | undefined,
): string | undefined => entry?.baseUrl ?? provider?.baseUrl;

/**
 * What an omitted field means. A model entry is a complete record, so an omitted
 * field is unset. An override is a patch, so an omitted field keeps what the file
 * already had: the dialog only sends the fields the operator touched.
 */
type MergePolicy = "unset" | "keep";

/**
 * Apply one field. `emptyIsValue` marks the fields where `[]`, `{}` or `""` is a
 * real answer rather than an emptied control.
 */
const writeField = <Key extends keyof StoredFields>(
	next: StoredFields,
	key: Key,
	value: StoredFields[Key] | undefined,
	policy: MergePolicy,
	emptyIsValue: boolean,
): void => {
	if (value === undefined) {
		if (policy === "unset") delete next[key];
		return;
	}
	if (emptyIsValue) next[key] = value;
	else setOrDelete(next, key, value);
};

/**
 * Apply the fields the payload owns to one model record. Unknown keys already on
 * `stored` survive the merge. `input` and the numbers are set whenever they are
 * given: an empty list is an answer, and `0` is a value.
 */
export const mergeModelFields = (
	stored: StoredFields,
	input: ModelOverride,
	policy: MergePolicy = "unset",
): StoredFields => {
	const next: StoredFields = { ...stored };
	writeField(next, "name", input.name, policy, false);
	writeField(next, "api", input.api, policy, true);
	writeField(next, "baseUrl", input.baseUrl, policy, false);
	writeField(next, "reasoning", input.reasoning, policy, true);
	writeField(next, "thinkingLevelMap", input.thinkingLevelMap, policy, false);
	writeField(next, "compat", input.compat, policy, false);
	writeField(next, "input", input.input, policy, true);
	writeField(next, "inputLimits", input.inputLimits, policy, false);
	writeField(next, "promptCache", input.promptCache, policy, false);
	writeField(next, "samplingParams", input.samplingParams, policy, false);
	writeField(
		next,
		"samplingParamsByThinkingLevel",
		input.samplingParamsByThinkingLevel,
		policy,
		false,
	);
	writeField(next, "contextWindow", input.contextWindow, policy, true);
	writeField(next, "maxTokens", input.maxTokens, policy, true);
	// pi merges an override's cost per field. A model entry's cost is a complete
	// record, so an omitted one is unset and a named one replaces the stored cost.
	if (input.cost === undefined) {
		if (policy === "unset") delete next.cost;
	} else if (policy === "unset" || stored.cost === undefined) {
		next.cost = input.cost;
	} else {
		const cost: NonNullable<ModelOverride["cost"]> = {
			input: input.cost.input ?? stored.cost.input,
			output: input.cost.output ?? stored.cost.output,
			cacheRead: input.cost.cacheRead ?? stored.cost.cacheRead,
			cacheWrite: input.cost.cacheWrite ?? stored.cost.cacheWrite,
		};
		const tiers = input.cost.tiers ?? stored.cost.tiers;
		if (tiers !== undefined) cost.tiers = tiers;
		next.cost = cost;
	}
	// A header value never comes back to the browser, so a blank one keeps the stored
	// value and a key left out of the record is removed.
	if (input.headers === undefined) {
		if (policy === "unset") delete next.headers;
	} else {
		const headers = mergeSecrets(input.headers, stored.headers ?? {}, {
			onMissingStored: "drop",
		});
		if (headers === undefined) delete next.headers;
		else next.headers = headers;
	}
	return next;
};
