/**
 * The form rules for a provider and its models. The server schema stays the
 * contract; this adds what only the form knows: which fields a custom provider
 * must fill, that a URL has to be absolute, that a model's token and cost
 * numbers are numbers, and that a cost is all four values or none.
 *
 * A blank optional field is valid, and `inputOf` leaves it out of the payload
 * rather than storing an empty string. Only the fields that fail come back, so
 * the caller can put each message under its own control.
 */
import { z } from "zod";
import { providerApiSchema, providerInputSchema } from "shared";

import type { ProviderDraft } from "./provider-draft";

const trim = (value: string): string => value.trim();

const urlMessage = "Enter an absolute URL, e.g. https://api.example.com/v1";
const amountPattern = /^\d+(\.\d+)?$/u;
const countPattern = /^\d+$/u;

const providerId = z
	.string()
	.transform(trim)
	.pipe(z.string().min(1, "A provider needs an id."))
	.pipe(providerInputSchema.shape.id);

export type ProviderField = "id" | "baseUrl" | "api";

export const providerFields: readonly ProviderField[] = ["id", "baseUrl", "api"];

export type ProviderFieldErrors = Partial<Record<ProviderField, string>>;

export function providerFieldErrors(draft: ProviderDraft, builtin: boolean): ProviderFieldErrors {
	const baseUrl = z
		.string()
		.transform(trim)
		.refine((value) => value === "" || z.url().safeParse(value).success, urlMessage)
		.refine((value) => builtin || value !== "", "A custom provider needs a base URL.");
	const api = z
		.union([z.literal(""), providerApiSchema])
		.refine((value) => builtin || value !== "", "Choose the API family this provider speaks.");

	const result = z.object({ id: providerId, baseUrl, api }).safeParse(draft);
	return fieldErrors(result, providerFields);
}

export type ModelField =
	| "id"
	| "baseUrl"
	| "contextWindow"
	| "maxTokens"
	| "costInput"
	| "costOutput"
	| "costCacheRead"
	| "costCacheWrite";

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
];

const costFields: readonly ModelField[] = [
	"costInput",
	"costOutput",
	"costCacheRead",
	"costCacheWrite",
];

export type ModelFormValues = Record<ModelField, string>;

export function modelFieldErrors(form: ModelFormValues): ModelFieldErrors {
	const filled = costFields.filter((field) => form[field].trim() !== "").length;
	const allOrNone = filled === 0 || filled === costFields.length;

	const tokenCount = z
		.string()
		.transform(trim)
		.refine(
			(value) => value === "" || (countPattern.test(value) && Number(value) > 0),
			"Use a whole number of tokens.",
		);
	const cost = z
		.string()
		.transform(trim)
		.refine((value) => value === "" || amountPattern.test(value), "Use a number, e.g. 3 or 0.5.")
		.refine((value) => value !== "" || allOrNone, "Fill all four costs, or leave them all empty.");

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
		})
		.safeParse(form);

	return fieldErrors(result, modelFields);
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
