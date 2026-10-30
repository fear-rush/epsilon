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

const urlMessage = "Enter an absolute URL.";
const amountPattern = /^\d+(\.\d+)?$/u;
const countPattern = /^\d+$/u;

const providerId = z
	.string()
	.transform(trim)
	.pipe(z.string().min(1, "A provider needs an id."))
	.pipe(providerInputSchema.shape.id);

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
