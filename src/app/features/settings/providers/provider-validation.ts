import {
	isBaseUrl,
	isProviderApi,
	isProviderId,
	PROVIDER_ID_PROBLEM,
} from "#domain/providers/rules";

import type { ProviderDraft } from "./provider-draft";
import { parseCostTiers, parseSamplingByLevel, parseSamplingParams } from "./provider-model-form";
import type { ModelForm, ModelMode } from "./provider-model-form";

/**
 * The form rules for a provider and its models. The protocol schema stays the
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

const URL_MESSAGE = "Enter an absolute URL.";
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/u;
const COUNT_PATTERN = /^\d+$/u;

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
	const errors: ProviderFieldErrors = {};
	const name = draft.name.trim();
	if (nameRequired && name === "") errors.name = "A provider needs a name.";
	else if (name !== "" && takenNames.has(name.toLowerCase())) {
		errors.name = "Provider names must be unique.";
	}
	const id = draft.id.trim();
	if (id === "") errors.id = "A provider needs an id.";
	else if (!isProviderId(id)) errors.id = PROVIDER_ID_PROBLEM;
	else if (takenIds.has(id)) errors.id = "This provider id is already used.";
	const baseUrl = draft.baseUrl.trim();
	if (baseUrl !== "" && !isBaseUrl(baseUrl)) errors.baseUrl = URL_MESSAGE;
	else if (!builtin && baseUrl === "") errors.baseUrl = "A custom provider needs a base URL.";
	// An empty family is a real answer for a built-in, which inherits pi's.
	const apiMessage = "Choose the API family this provider speaks.";
	if (draft.api === "") {
		if (!builtin) errors.api = apiMessage;
	} else if (!isProviderApi(draft.api)) errors.api = apiMessage;
	if (
		draft.headers.some((row) => row.key.trim() === "" || (!row.stored && row.value.trim() === ""))
	) {
		errors.headers = "Fill the header name and value, or remove the row.";
	}
	// pi refuses the file when radius OAuth has no base URL of its own.
	if (draft.oauth && baseUrl === "") errors.baseUrl = "pi needs a base URL for radius OAuth.";
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

const COST_FIELDS = ["costInput", "costOutput", "costCacheRead", "costCacheWrite"] as const;

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

/** The first message for a control, or nothing when the text is blank or whole. */
const problemOf = (
	value: string,
	valid: (trimmed: string) => boolean,
	message: string,
): string | undefined => {
	const trimmed = value.trim();
	return trimmed === "" || valid(trimmed) ? undefined : message;
};

const JSON_BLOCK_MESSAGE = "Use a JSON object, or leave it empty.";
const JSON_LEVELS_MESSAGE = "Use a JSON object keyed by thinking level, or leave it empty.";
const JSON_TIERS_MESSAGE = "Use a JSON array of tiers, or leave it empty.";
const COST_MESSAGE = "Use a number, e.g. 3 or 0.5.";
const COUNT_MESSAGE = "Use a whole number above 0.";
const TOKENS_MESSAGE = "Use a whole number of tokens.";

const isCount = (trimmed: string): boolean => COUNT_PATTERN.test(trimmed) && Number(trimmed) > 0;
const isAmount = (trimmed: string): boolean => AMOUNT_PATTERN.test(trimmed);

export function modelFieldErrors(form: ModelForm, mode: ModelMode): ModelFieldErrors {
	const errors: ModelFieldErrors = {};
	const endpoint = mode === "model";
	const filled = COST_FIELDS.filter((field) => form[field].trim() !== "").length;
	// A model entry carries all four rates or no cost; an override may name only some.
	const allOrNone = mode === "override" || filled === 0 || filled === COST_FIELDS.length;

	if (form.id.trim() === "") errors.id = "A model needs an id.";
	const baseUrlProblem = problemOf(form.baseUrl, isBaseUrl, URL_MESSAGE);
	if (baseUrlProblem !== undefined) errors.baseUrl = baseUrlProblem;
	for (const field of ["contextWindow", "maxTokens"] as const) {
		const problem = problemOf(form[field], isCount, TOKENS_MESSAGE);
		if (problem !== undefined) errors[field] = problem;
	}
	for (const field of COST_FIELDS) {
		const trimmed = form[field].trim();
		if (trimmed !== "" && !isAmount(trimmed)) errors[field] = COST_MESSAGE;
		else if (trimmed === "" && !allOrNone) {
			errors[field] = "Fill all four costs, or leave them all empty.";
		}
	}
	const tiers = form.costTiers.trim();
	if (tiers !== "" && parseCostTiers(form.costTiers) === undefined) {
		errors.costTiers = JSON_TIERS_MESSAGE;
	}
	for (const field of [
		"maxRequestBytes",
		"imageResizeWidth",
		"imageResizeHeight",
		"imageResizeBytes",
		"imageMaxPerMessage",
		"imageMaxPerRequest",
	] as const) {
		const problem = problemOf(form[field], isCount, COUNT_MESSAGE);
		if (problem !== undefined) errors[field] = problem;
	}
	const quality = problemOf(
		form.imageJpegQuality,
		(trimmed) => isCount(trimmed) && Number(trimmed) <= 100,
		"Use a whole number from 1 to 100.",
	);
	if (quality !== undefined) errors.imageJpegQuality = quality;
	for (const field of ["promptCacheShort", "promptCacheLong"] as const) {
		const problem = problemOf(
			form[field],
			(trimmed) => isAmount(trimmed) && Number(trimmed) > 0,
			"Use a number above 0.",
		);
		if (problem !== undefined) errors[field] = problem;
	}
	if (form.samplingParams.trim() !== "" && parseSamplingParams(form.samplingParams) === undefined) {
		errors.samplingParams = JSON_BLOCK_MESSAGE;
	}
	if (
		form.samplingParamsByLevel.trim() !== "" &&
		parseSamplingByLevel(form.samplingParamsByLevel) === undefined
	) {
		errors.samplingParamsByLevel = JSON_LEVELS_MESSAGE;
	}
	// An override dialog shows no base URL field, so a stored one must not block it.
	if (!endpoint) delete errors.baseUrl;
	// pi's model cost needs its four rates before it can carry tiers; an override's
	// partial cost may name tiers alone.
	if (mode === "model" && tiers !== "" && filled !== COST_FIELDS.length) {
		errors.costTiers = "Fill all four rates, or clear the tiers.";
	}
	return errors;
}
