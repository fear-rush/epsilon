/**
 * The `models.json` shape the dashboard edits. pi ships no writer for this file,
 * so the documented fields live in loose zod objects: unknown keys stay on every
 * object, and a write never drops a block this version does not model (docs/DECISIONS.md, Configure in the dashboard).
 */
import { z } from "zod";
import { parseProviderApi } from "shared";

import { setOrDelete } from "../../platform/patch";
import type { ModelOverride, ReasoningCompat, ThinkingLevelMap } from "./contract";
import { reasoningCompatSchema, thinkingLevelMapSchema } from "./contract";

const storedModelSchema = z.looseObject({
	id: z.string(),
	name: z.string().optional(),
	api: z.string().optional(),
	baseUrl: z.string().optional(),
	reasoning: z.boolean().optional(),
	thinkingLevelMap: thinkingLevelMapSchema.optional(),
	compat: reasoningCompatSchema.optional(),
	input: z.array(z.string()).optional(),
	contextWindow: z.number().optional(),
	maxTokens: z.number().optional(),
	cost: z
		.looseObject({
			input: z.number(),
			output: z.number(),
			cacheRead: z.number(),
			cacheWrite: z.number(),
		})
		.optional(),
});

const providerEntrySchema = z.looseObject({
	name: z.string().optional(),
	baseUrl: z.string().optional(),
	api: z.string().optional(),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	compat: reasoningCompatSchema.optional(),
	models: z.array(storedModelSchema).optional(),
	modelOverrides: z.record(z.string(), storedModelSchema.omit({ id: true })).optional(),
});

export const modelsFileSchema = z.looseObject({
	providers: z.record(z.string(), providerEntrySchema).optional(),
});

export type ModelsFile = z.infer<typeof modelsFileSchema>;
export type ProviderEntry = z.infer<typeof providerEntrySchema>;
export type StoredModel = z.infer<typeof storedModelSchema>;

/** The editable fields, without the loose index signature Omit would keep. */
export type StoredFields = {
	name?: string;
	api?: string;
	baseUrl?: string;
	reasoning?: boolean;
	thinkingLevelMap?: ThinkingLevelMap;
	compat?: ReasoningCompat;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/** The API family a stored entry names, or undefined when it names none. */
export const apiOf = (entry: { api?: string } | undefined): ModelOverride["api"] =>
	parseProviderApi(entry?.api ?? "");

/** The editable fields of a stored model, in the shape the panel reads. */
export const fieldsOf = (model: StoredFields): ModelOverride => ({
	name: model.name,
	api: parseProviderApi(model.api ?? ""),
	baseUrl: model.baseUrl,
	reasoning: model.reasoning,
	thinkingLevelMap: model.thinkingLevelMap,
	compat: model.compat,
	input: model.input?.filter(
		(kind): kind is "text" | "image" => kind === "text" || kind === "image",
	),
	contextWindow: model.contextWindow,
	maxTokens: model.maxTokens,
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
	writeField(next, "contextWindow", input.contextWindow, policy, true);
	writeField(next, "maxTokens", input.maxTokens, policy, true);
	writeField(next, "cost", input.cost, policy, true);
	return next;
};
