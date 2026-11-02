/**
 * The form rules for a provider and its models. The server schema stays the
 * contract; this adds what only the form knows: which fields a custom provider
 * must fill, that a URL has to be absolute, that a model's token and cost
 * numbers are numbers, and that a cost is all four values or none.
 *
 * `endpoint` is false for an override, which has no API family or base URL, so a
 * stored value in either must not block a save.
 *
 * A blank optional field is valid, and `inputOf` leaves it out of the payload
 * rather than storing an empty string. Only the fields that fail come back, so
 * the caller can put each message under its own control.
 */
import { z } from "zod";
import { providerApiSchema, providerIdSchema } from "shared";

import type { ProviderDraft } from "./provider-draft";
import {
	costTiersSchema,
	jsonOf,
	samplingByLevelSchema,
	samplingParamsSchema,
} from "./provider-model-form";
import type { ModelForm } from "./provider-model-form";

const trim = (value: string): string => value.trim();

const urlMessage = "Enter an absolute URL.";
const amountPattern = /^\d+(\.\d+)?$/u;
const countPattern = /^\d+$/u;

const providerId = z
	.string()
	.transform(trim)
	.pipe(z.string().min(1, "A provider needs an id."))
	.pipe(providerIdSchema);

export type ProviderField = "name" | "id" | "baseUrl" | "api" | "headers";

export const providerFields: readonly ProviderField[] = ["name", "id", "baseUrl", "api", "headers"];

export type ProviderFieldErrors = Partial<Record<ProviderField, string>>;

export type ProviderValidation = {
	/** Ids already in the settings snapshot, so a new name cannot reuse one. */
	takenIds?: ReadonlySet<string>;
	/** Lowercased names already in the settings snapshot. */
	takenNames?: ReadonlySet<string>;
	/** A new custom provider needs a name, because the id is derived from it. */
	nameRequired?: boolean;
};

export function providerFieldErrors(
	draft: ProviderDraft,
	builtin: boolean,
	{ takenIds = new Set(), takenNames = new Set(), nameRequired = false }: ProviderValidation = {},
): ProviderFieldErrors {
	const name = z
		.string()
		.transform(trim)
		.refine((value) => !nameRequired || value !== "", "A provider needs a name.")
		.refine(
			(value) => value === "" || !takenNames.has(value.toLowerCase()),
			"Provider names must be unique.",
		);
	const id = providerId.refine(
		(value) => !takenIds.has(value),
		"This provider id is already used.",
	);
	const baseUrl = z
		.string()
		.transform(trim)
		.refine((value) => value === "" || z.url().safeParse(value).success, urlMessage)
		.refine((value) => builtin || value !== "", "A custom provider needs a base URL.");
	const api = z
		.union([z.literal(""), providerApiSchema])
		.refine((value) => builtin || value !== "", "Choose the API family this provider speaks.");

	const result = z.object({ name, id, baseUrl, api }).safeParse(draft);
	const errors = fieldErrors(result, providerFields);
	const incomplete = draft.headers.some(
		(row) => row.key.trim() === "" || (!row.stored && row.value.trim() === ""),
	);
	if (incomplete) errors.headers = "Fill the header name and value, or remove the row.";
	// pi refuses the file when radius OAuth has no base URL of its own.
	if (draft.oauth && draft.baseUrl.trim() === "") {
		errors.baseUrl = "pi needs a base URL for radius OAuth.";
	}
	return errors;
}

export type ModelField =
	| "id"
	| "baseUrl"
	| "contextWindow"
	| "maxTokens"
	| "costInput"
	| "costOutput"
	| "costCacheRead"
	| "costCacheWrite"
	| "costTiers"
	| "maxRequestBytes"
	| "imageResizeWidth"
	| "imageResizeHeight"
	| "imageResizeBytes"
	| "imageJpegQuality"
	| "imageMaxPerMessage"
	| "imageMaxPerRequest"
	| "promptCacheShort"
	| "promptCacheLong"
	| "samplingParams"
	| "samplingParamsByLevel"
	| "headers";

export type ModelFieldErrors = Partial<Record<ModelField, string>>;

export const modelFields: readonly ModelField[] = [
	"id",
	"baseUrl",
	"contextWindow",
	"maxTokens",
	"costInput",
	"costOutput",
	"costCacheRead",
	"costCacheWrite",
	"costTiers",
	"maxRequestBytes",
	"imageResizeWidth",
	"imageResizeHeight",
	"imageResizeBytes",
	"imageJpegQuality",
	"imageMaxPerMessage",
	"imageMaxPerRequest",
	"promptCacheShort",
	"promptCacheLong",
	"samplingParams",
	"samplingParamsByLevel",
	"headers",
];

const costFields = ["costInput", "costOutput", "costCacheRead", "costCacheWrite"] as const;

/** The controls inside the Advanced card, so a failed save can open it. */
export const advancedFields: readonly ModelField[] = [
	"costTiers",
	"maxRequestBytes",
	"imageResizeWidth",
	"imageResizeHeight",
	"imageResizeBytes",
	"imageJpegQuality",
	"imageMaxPerMessage",
	"imageMaxPerRequest",
	"promptCacheShort",
	"promptCacheLong",
	"samplingParams",
	"samplingParamsByLevel",
	"headers",
];

export function modelFieldErrors(form: ModelForm, endpoint = true): ModelFieldErrors {
	const filled = costFields.filter((field) => form[field].trim() !== "").length;
	const allOrNone = filled === 0 || filled === costFields.length;

	const tokenCount = z
		.string()
		.transform(trim)
		.refine(
			(value) => value === "" || (countPattern.test(value) && Number(value) > 0),
			"Use a whole number of tokens.",
		);
	const wholeNumber = z
		.string()
		.transform(trim)
		.refine(
			(value) => value === "" || (countPattern.test(value) && Number(value) > 0),
			"Use a whole number above 0.",
		);
	const jpegQuality = z
		.string()
		.transform(trim)
		.refine(
			(value) =>
				value === "" || (countPattern.test(value) && Number(value) >= 1 && Number(value) <= 100),
			"Use a whole number from 1 to 100.",
		);
	const seconds = z
		.string()
		.transform(trim)
		.refine(
			(value) => value === "" || (amountPattern.test(value) && Number(value) > 0),
			"Use a number above 0.",
		);
	const cost = z
		.string()
		.transform(trim)
		.refine((value) => value === "" || amountPattern.test(value), "Use a number, e.g. 3 or 0.5.")
		.refine((value) => value !== "" || allOrNone, "Fill all four costs, or leave them all empty.");
	const jsonObject = z
		.string()
		.refine(
			(value) => value.trim() === "" || samplingParamsSchema.safeParse(jsonOf(value)).success,
			"Use a JSON object, or leave it empty.",
		);
	const jsonLevels = z
		.string()
		.refine(
			(value) => value.trim() === "" || samplingByLevelSchema.safeParse(jsonOf(value)).success,
			"Use a JSON object keyed by thinking level, or leave it empty.",
		);
	const jsonTiers = z
		.string()
		.refine(
			(value) => value.trim() === "" || costTiersSchema.safeParse(jsonOf(value)).success,
			"Use a JSON array of tiers, or leave it empty.",
		);

	const result = z
		.object({
			id: z.string().transform(trim).pipe(z.string().min(1, "A model needs an id.")),
			baseUrl: z
				.string()
				.transform(trim)
				.refine((value) => value === "" || z.url().safeParse(value).success, urlMessage),
			contextWindow: tokenCount,
			maxTokens: tokenCount,
			costInput: cost,
			costOutput: cost,
			costCacheRead: cost,
			costCacheWrite: cost,
			costTiers: jsonTiers,
			maxRequestBytes: wholeNumber,
			imageResizeWidth: wholeNumber,
			imageResizeHeight: wholeNumber,
			imageResizeBytes: wholeNumber,
			imageJpegQuality: jpegQuality,
			imageMaxPerMessage: wholeNumber,
			imageMaxPerRequest: wholeNumber,
			promptCacheShort: seconds,
			promptCacheLong: seconds,
			samplingParams: jsonObject,
			samplingParamsByLevel: jsonLevels,
		})
		.safeParse(form);

	const errors = fieldErrors(result, modelFields);
	// An override dialog shows no base URL field, so a stored one must not block it.
	if (!endpoint) delete errors.baseUrl;
	// pi's cost needs its four rates before it can carry tiers.
	if (form.costTiers.trim() !== "" && filled !== costFields.length) {
		errors.costTiers = "Fill all four rates, or clear the tiers.";
	}
	return errors;
}

/** The first message per field, which is what a single control can show. */
function fieldErrors<Field extends string>(
	result: {
		success: boolean;
		error?: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
	},
	fields: readonly Field[],
): Partial<Record<Field, string>> {
	if (result.success || result.error === undefined) return {};
	const errors: Partial<Record<Field, string>> = {};
	for (const issue of result.error.issues) {
		const path = issue.path[0];
		const field = fields.find((candidate) => candidate === path);
		if (field !== undefined && errors[field] === undefined) errors[field] = issue.message;
	}
	return errors;
}
