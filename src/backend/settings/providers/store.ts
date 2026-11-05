import { Context, Effect, Layer, Option, Schema } from "effect";

import {
	isBaseUrl,
	isProviderApi,
	isProviderId,
	PROVIDER_ID_PROBLEM,
} from "#domain/providers/rules";
import { ThinkingLevel } from "#protocol/conversation/session";
import { ProviderRefused } from "#protocol/errors";
import {
	ModelOverride as ModelOverrideSchema,
	ProviderModelInput as ProviderModelInputSchema,
	ReasoningCompat,
	type ModelInputLimits,
	type ModelOverride,
	type ModelOverrideCost,
	type ModelPromptCache,
	type ProviderInput,
	type ProviderModelCostTier,
	type ProviderModelInput,
	type ProviderStored,
	type SamplingParamsByThinkingLevel,
	type ThinkingLevelMap,
} from "#protocol/settings/providers";

import { AgentHome } from "../../platform/agent-home.ts";
import type { FileUnreadable, FileUnwritable, Locked, NotJson } from "../../platform/errors.ts";
import { JsonDocument } from "../../platform/json-document.ts";
import type { JsonDocumentApi, JsonObject } from "../../platform/json-document.ts";
import { isJsonObject, setDefined, setOrDelete } from "../../platform/patch.ts";
import type { JsonValue } from "../../platform/patch.ts";

/**
 * `models.json`: the file the dashboard edits for custom providers.
 *
 * pi ships no writer for this file, so the documented fields are written here through
 * `JsonDocument`: unknown keys survive at every level, and a provider or model the dialog
 * keeps is merged field by field, so a `cost`, `compat` or `thinkingLevelMap` this version
 * does not model is not lost. A removal replaces the document, because a merge cannot
 * delete a key.
 *
 * Fields the dialog does not write are not the dialog's to change; `api` and `baseUrl` are
 * checked against the rules both sides run (`src/domain/providers/rules.ts`), because pi's
 * own loader would otherwise reject the whole file.
 */

/** What `models.json` holds for one provider, as the editor needs it. */
export type StoredProvider = {
	/** The provider's own fields, with the key reduced to its form. */
	readonly stored: ProviderStored;
	/** Names only; a stored header's value never leaves the server. */
	readonly headerKeys: ReadonlyArray<string>;
	/** The models the entry declares. */
	readonly models: ReadonlyArray<ProviderModelInput>;
	/** The changes to pi's own models, field by field. */
	readonly modelOverrides: Readonly<Record<string, ModelOverride>>;
};

export type ProvidersStoreApi = {
	/** The provider ids `models.json` declares, which are the ones this page may edit. */
	readonly customIds: Effect.Effect<ReadonlySet<string>>;
	/** The stored entry, reduced to what the page may see. */
	readonly read: (id: string) => Effect.Effect<StoredProvider, ProviderRefused>;
	readonly save: (input: ProviderInput) => Effect.Effect<void, ProviderRefused>;
	readonly remove: (id: string) => Effect.Effect<void, ProviderRefused>;
	readonly setApiKey: (id: string, apiKey: string) => Effect.Effect<void, ProviderRefused>;
};

export class ProvidersStore extends Context.Service<ProvidersStore, ProvidersStoreApi>()(
	"epsilon/ProvidersStore",
) {}

const refusal = (providerId: string, reason: string): ProviderRefused =>
	new ProviderRefused({ providerId, reason });

const providersOf = (document: JsonObject): JsonObject => {
	const providers = document["providers"];
	return isJsonObject(providers) ? providers : {};
};

/** The stored entry for one provider as a mutable copy, or an empty object. */
const entryOf = (providers: JsonObject, id: string): JsonObject => {
	const entry = providers[id];
	return isJsonObject(entry) ? { ...entry } : {};
};

/** The provider's models as a list, each entry copied so unknown fields survive. */
const modelsOf = (entry: JsonObject): ReadonlyArray<JsonObject> => {
	const models = entry["models"];
	if (!Array.isArray(models)) return [];
	return models.filter(isJsonObject);
};

/** The stored string entries of one block, ignoring a value that is not a string. */
const stringMapOf = (value: JsonValue | undefined): Record<string, string> => {
	if (!isJsonObject(value)) return {};
	const entries: Array<[string, string]> = [];
	for (const [key, entry] of Object.entries(value)) {
		if (Schema.is(Schema.String)(entry)) entries.push([key, entry]);
	}
	return Object.fromEntries(entries);
};

/** One field as the file holds it: the file has no `undefined`, so an absent one is left out. */
const put = (target: JsonObject, key: string, value: JsonValue | undefined): void => {
	if (value !== undefined) target[key] = value;
};

/** A block as the file holds it, or nothing when the payload did not name it. */
const whenDefined = <Value>(
	value: Value | undefined,
	write: (present: Value) => JsonValue,
): JsonValue | undefined => (value === undefined ? undefined : write(value));

/** JSON as the schema decodes it: readonly arrays, which the file's tree is not. */
type DecodedJson = (typeof Schema.Json)["Type"];

/**
 * A JSON block as the file holds it. A decoded block is readonly and the file's tree is
 * not, so this is the schema's own mutable form of the same value.
 */
const jsonValueOf = (value: DecodedJson): JsonValue =>
	Schema.decodeUnknownSync(Schema.MutableJson)(value);

/** pi's thinking-level map as the file writes it; a level it was not given stays unset. */
const levelMapOf = (map: ThinkingLevelMap): JsonObject => {
	const next: JsonObject = {};
	for (const level of ThinkingLevel.literals) {
		const value = map[level];
		if (value !== undefined) next[level] = value;
	}
	return next;
};

/** The reasoning compatibility as the file writes it, one key at a time. */
const compatOf = (compat: ReasoningCompat): JsonObject => {
	const next: JsonObject = {};
	put(next, "thinkingFormat", compat.thinkingFormat);
	put(next, "supportsReasoningEffort", compat.supportsReasoningEffort);
	put(next, "thinkingTokenBudgetField", compat.thinkingTokenBudgetField);
	put(
		next,
		"requiresReasoningContentOnAssistantMessages",
		compat.requiresReasoningContentOnAssistantMessages,
	);
	put(next, "forceAdaptiveThinking", compat.forceAdaptiveThinking);
	return next;
};

/** The cost rates and tiers the payload names; an override may name only some rates. */
const costOf = (cost: ModelOverrideCost): JsonObject => {
	const next: JsonObject = {};
	put(next, "input", cost.input);
	put(next, "output", cost.output);
	put(next, "cacheRead", cost.cacheRead);
	put(next, "cacheWrite", cost.cacheWrite);
	if (cost.tiers !== undefined) next["tiers"] = cost.tiers.map(tierOf);
	return next;
};

/** One price tier as the file writes it. */
const tierOf = (tier: ProviderModelCostTier): JsonObject => ({
	cacheRead: tier.cacheRead,
	cacheWrite: tier.cacheWrite,
	input: tier.input,
	inputTokensAbove: tier.inputTokensAbove,
	output: tier.output,
});

/** The compat block with the payload's keys over the stored ones; unknown keys survive. */
const mergeCompat = (stored: JsonValue | undefined, compat: ReasoningCompat): JsonObject => {
	const next: JsonObject = isJsonObject(stored) ? { ...stored } : {};
	const written = compatOf(compat);
	for (const key of Object.keys(ReasoningCompat.fields)) setOrDelete(next, key, written[key]);
	return next;
};

/** The request limits as the file writes them, one nested block at a time. */
const limitsOf = (limits: ModelInputLimits): JsonObject => {
	const next: JsonObject = {};
	put(next, "maxRequestBytes", limits.maxRequestBytes);
	const images = limits.images;
	if (images !== undefined) {
		const block: JsonObject = {};
		put(block, "maxPerMessage", images.maxPerMessage);
		put(block, "maxPerRequest", images.maxPerRequest);
		const resize = images.resize;
		if (resize !== undefined) {
			const sizes: JsonObject = {};
			put(sizes, "maxWidth", resize.maxWidth);
			put(sizes, "maxHeight", resize.maxHeight);
			put(sizes, "maxBytes", resize.maxBytes);
			put(sizes, "jpegQuality", resize.jpegQuality);
			put(block, "resize", sizes);
		}
		put(next, "images", block);
	}
	return next;
};

/** The cache lifetimes as the file writes them. */
const promptCacheOf = (cache: ModelPromptCache): JsonObject => {
	const next: JsonObject = {};
	put(next, "short", cache.short);
	put(next, "long", cache.long);
	return next;
};

/** The sampling blocks as the file writes them, one level at a time. */
const samplingByLevelOf = (levels: SamplingParamsByThinkingLevel): JsonObject => {
	const next: JsonObject = {};
	for (const level of ThinkingLevel.literals) {
		const params = levels[level];
		if (params !== undefined) next[level] = jsonValueOf(params);
	}
	return next;
};

/**
 * What an omitted field means. A model entry is a complete record, so an omitted field is
 * unset. An override is a patch, so an omitted field keeps what the file already had.
 */
type MergePolicy = "unset" | "keep";

/**
 * Write one payload-owned field. `emptyIsValue` marks the fields where `[]`, `""` or `0`
 * is a real answer: an empty input list means text only, and a cleared family is empty.
 */
const writeField = (
	next: JsonObject,
	key: string,
	value: JsonValue | undefined,
	policy: MergePolicy,
	emptyIsValue: boolean,
): void => {
	if (value === undefined && policy === "keep") return;
	if (emptyIsValue) setDefined(next, key, value);
	else setOrDelete(next, key, value);
};

/**
 * A blank value for a stored header keeps the stored one; a name left out is removed.
 * The values never travel to the page, so a save that keeps a header has nothing to send.
 */
const mergeHeaders = (
	incoming: Readonly<Record<string, string>> | undefined,
	stored: Readonly<Record<string, string>>,
): Record<string, string> | undefined => {
	if (incoming === undefined) return undefined;
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries(incoming)) {
		const kept = stored[key];
		if (value !== "") merged[key] = value;
		else if (kept !== undefined) merged[key] = kept;
	}
	return Object.keys(merged).length === 0 ? undefined : merged;
};

/**
 * The payload's model as the file's entry. A model is a complete record, so a field the
 * payload leaves out is unset, while keys this version does not model survive the merge.
 */
const mergeModel = (stored: JsonObject, input: ModelOverride, policy: MergePolicy): JsonObject => {
	const next: JsonObject = { ...stored };
	writeField(next, "name", input.name, policy, false);
	writeField(next, "api", input.api, policy, true);
	writeField(next, "baseUrl", input.baseUrl, policy, false);
	writeField(next, "reasoning", input.reasoning, policy, true);
	writeField(
		next,
		"thinkingLevelMap",
		whenDefined(input.thinkingLevelMap, levelMapOf),
		policy,
		false,
	);
	// The known keys are the payload's to write; a key this version does not name survives.
	writeField(
		next,
		"compat",
		whenDefined(input.compat, (compat) => mergeCompat(stored["compat"], compat)),
		policy,
		false,
	);
	writeField(next, "input", input.input === undefined ? undefined : [...input.input], policy, true);
	writeField(next, "inputLimits", whenDefined(input.inputLimits, limitsOf), policy, false);
	writeField(next, "promptCache", whenDefined(input.promptCache, promptCacheOf), policy, false);
	writeField(next, "samplingParams", whenDefined(input.samplingParams, jsonValueOf), policy, false);
	writeField(
		next,
		"samplingParamsByThinkingLevel",
		whenDefined(input.samplingParamsByThinkingLevel, samplingByLevelOf),
		policy,
		false,
	);
	writeField(next, "contextWindow", input.contextWindow, policy, true);
	writeField(next, "maxTokens", input.maxTokens, policy, true);
	// pi merges an override's cost per field; a model entry's cost is a complete record.
	const cost = input.cost === undefined ? undefined : costOf(input.cost);
	const storedCost = next["cost"];
	if (cost !== undefined && policy === "keep" && isJsonObject(storedCost)) {
		next["cost"] = { ...storedCost, ...cost };
	} else writeField(next, "cost", cost, policy, false);
	// A blank header value keeps the stored one, and a name left out is removed.
	if (input.headers === undefined) {
		if (policy === "unset") delete next["headers"];
	} else {
		const headers = mergeHeaders(input.headers, stringMapOf(stored["headers"]));
		if (headers === undefined) delete next["headers"];
		else next["headers"] = headers;
	}
	return next;
};

/** Every platform failure becomes the refusal the page shows, naming this provider. */
const platformHandlers = (id: string) => ({
	FileUnreadable: (error: FileUnreadable) => Effect.fail(refusal(id, error.reason)),
	FileUnwritable: (error: FileUnwritable) => Effect.fail(refusal(id, error.reason)),
	Locked: () => Effect.fail(refusal(id, "models.json is locked; try again.")),
	NotJson: (error: NotJson) =>
		Effect.fail(refusal(id, `models.json could not be read: ${error.reason}`)),
});

/** The same handlers for a call that may also refuse on its own: its refusal passes through. */
const saveHandlers = (id: string) => ({
	...platformHandlers(id),
	ProviderRefused: (error: ProviderRefused) => Effect.fail(error),
});

const guarded =
	(id: string) =>
	<A>(
		effect: Effect.Effect<A, FileUnreadable | FileUnwritable | Locked | NotJson>,
	): Effect.Effect<A, ProviderRefused> =>
		effect.pipe(Effect.catchTags(platformHandlers(id)));

/**
 * The three checks a provider passes before any file is touched. An empty family or
 * endpoint is an answer, not a mistake: it clears the stored value and pi inherits.
 */
const checked = (input: ProviderInput): Effect.Effect<ProviderInput, ProviderRefused> => {
	if (!isProviderId(input.id)) return Effect.fail(refusal(input.id, PROVIDER_ID_PROBLEM));
	if (input.api !== "" && !isProviderApi(input.api)) {
		return Effect.fail(refusal(input.id, `${input.api} is not one of pi's API families.`));
	}
	if (input.baseUrl !== "" && !isBaseUrl(input.baseUrl)) {
		return Effect.fail(refusal(input.id, "The base URL must start with http:// or https://."));
	}
	return Effect.succeed(input);
};

const checkedId = (id: string): Effect.Effect<string, ProviderRefused> =>
	isProviderId(id) ? Effect.succeed(id) : Effect.fail(refusal(id, "That is not a provider id."));

/** A model as the page may see it: a header's value stays on the server. */
const headerKeysOnly = <Value extends { readonly headers?: Record<string, string> | undefined }>(
	model: Value,
): Value =>
	model.headers === undefined
		? model
		: {
				...model,
				headers: Object.fromEntries(Object.keys(model.headers).map((key) => [key, ""])),
			};

/** A JSON object with at least one entry. */
const hasEntries = (value: JsonValue | undefined): boolean =>
	isJsonObject(value) && Object.keys(value).length > 0;

/** A stored key's form; the value itself never leaves the file. */
const keyForm = (value: JsonValue | undefined): ProviderStored["apiKeyForm"] => {
	if (!Schema.is(Schema.String)(value)) return undefined;
	if (value.startsWith("$")) return "environment";
	if (value.startsWith("!")) return "command";
	return "literal";
};

/** Whether the entry configures anything, which is what pi refuses to load without. */
const configures = (entry: JsonObject): boolean =>
	hasEntries(entry["models"]) ||
	entry["baseUrl"] !== undefined ||
	entry["headers"] !== undefined ||
	entry["compat"] !== undefined ||
	hasEntries(entry["modelOverrides"]) ||
	(Schema.is(Schema.String)(entry["apiKey"]) && entry["apiKey"] !== "") ||
	entry["oauth"] !== undefined ||
	entry["authHeader"] !== undefined;

/** The stored fields, built one at a time so an absent one stays absent. */
type StoredFields = {
	name?: string;
	baseUrl?: string;
	api?: string;
	apiKeyForm?: ProviderStored["apiKeyForm"];
	compat?: ProviderStored["compat"];
	authHeader?: boolean;
	oauth?: ProviderStored["oauth"];
};

/** The entry's own fields, built one at a time so an absent one stays absent. */
const storedFieldsOf = (entry: JsonObject): ProviderStored => {
	const name = entry["name"];
	const baseUrl = entry["baseUrl"];
	const api = entry["api"];
	const compat = entry["compat"];
	const authHeader = entry["authHeader"];
	const oauth = entry["oauth"];
	const form = keyForm(entry["apiKey"]);
	const stored: StoredFields = {};
	if (Schema.is(Schema.String)(name)) stored.name = name;
	if (Schema.is(Schema.String)(baseUrl)) stored.baseUrl = baseUrl;
	if (Schema.is(Schema.String)(api)) stored.api = api;
	if (form !== undefined) stored.apiKeyForm = form;
	const parsedCompat = Schema.decodeUnknownOption(ReasoningCompat)(compat);
	if (Option.isSome(parsedCompat)) stored.compat = parsedCompat.value;
	if (Schema.is(Schema.Boolean)(authHeader)) stored.authHeader = authHeader;
	if (oauth === "radius") stored.oauth = oauth;
	return stored;
};

export const makeProvidersStore = (deps: {
	readonly document: JsonDocumentApi;
	readonly path: string;
}): ProvidersStoreApi => {
	const customIds = deps.document.read(deps.path).pipe(
		Effect.map((document) => new Set(Object.keys(providersOf(document)))),
		// A file Epsilon cannot read shows as pi's own composition error; it has no ids.
		Effect.catchTags({
			FileUnreadable: () => Effect.succeed(new Set<string>()),
			NotJson: () => Effect.succeed(new Set<string>()),
		}),
	);

	const read = (id: string): Effect.Effect<StoredProvider, ProviderRefused> =>
		Effect.flatMap(checkedId(id), (valid) =>
			Effect.gen(function* () {
				const document = yield* deps.document.read(deps.path).pipe(guarded(valid));
				const entry = entryOf(providersOf(document), valid);
				const models: ProviderModelInput[] = [];
				for (const raw of modelsOf(entry)) {
					const decoded = Schema.decodeUnknownOption(ProviderModelInputSchema)(raw);
					if (Option.isNone(decoded)) {
						return yield* refusal(
							valid,
							"models.json declares a model that cannot be read; fix it there.",
						);
					}
					models.push(headerKeysOnly(decoded.value));
				}
				const rawOverrides = entry["modelOverrides"];
				const modelOverrides: Record<string, ModelOverride> = {};
				for (const [modelId, raw] of Object.entries(
					isJsonObject(rawOverrides) ? rawOverrides : {},
				)) {
					const decoded = Schema.decodeUnknownOption(ModelOverrideSchema)(raw);
					if (Option.isNone(decoded)) {
						return yield* refusal(
							valid,
							`models.json overrides ${modelId} with a value that cannot be read; fix it there.`,
						);
					}
					modelOverrides[modelId] = headerKeysOnly(decoded.value);
				}
				return {
					headerKeys: Object.keys(stringMapOf(entry["headers"])),
					modelOverrides,
					models,
					stored: storedFieldsOf(entry),
				} satisfies StoredProvider;
			}),
		);

	const save = (input: ProviderInput): Effect.Effect<void, ProviderRefused> =>
		Effect.flatMap(checked(input), (valid) =>
			deps.document
				.edit(deps.path, (current) =>
					Effect.gen(function* () {
						const providers = providersOf(current);
						const next = entryOf(providers, valid.id);
						setOrDelete(next, "name", valid.name);
						setOrDelete(next, "baseUrl", valid.baseUrl);
						setOrDelete(next, "api", valid.api);
						if (valid.apiKey !== undefined && valid.apiKey !== "") next["apiKey"] = valid.apiKey;
						if (valid.compat !== undefined) {
							setOrDelete(next, "compat", mergeCompat(next["compat"], valid.compat));
						}
						if (valid.authHeader !== undefined) {
							if (valid.authHeader === "") delete next["authHeader"];
							else next["authHeader"] = valid.authHeader;
						}
						if (valid.oauth !== undefined) {
							if (valid.oauth === "") delete next["oauth"];
							else next["oauth"] = valid.oauth;
						}
						if (valid.headers !== undefined) {
							setOrDelete(
								next,
								"headers",
								mergeHeaders(valid.headers, stringMapOf(next["headers"])),
							);
						}
						if (valid.models !== undefined) {
							const kept = new Map<string, JsonObject>();
							for (const model of modelsOf(next)) {
								const modelId = model["id"];
								if (Schema.is(Schema.String)(modelId)) kept.set(modelId, model);
							}
							setOrDelete(
								next,
								"models",
								valid.models.map((model) => ({
									...mergeModel(kept.get(model.id) ?? {}, model, "unset"),
									id: model.id,
								})),
							);
						}
						if (valid.modelOverrides !== undefined) {
							// The form sends only the fields the operator touched, so an omitted
							// field keeps the stored value. An id the form no longer shows is removed.
							const stored = next["modelOverrides"];
							const overrides: JsonObject = {};
							for (const [id, override] of Object.entries(valid.modelOverrides)) {
								const previous = isJsonObject(stored) ? stored[id] : undefined;
								overrides[id] = mergeModel(
									isJsonObject(previous) ? previous : {},
									override,
									"keep",
								);
							}
							setOrDelete(next, "modelOverrides", overrides);
						}
						// Saving an untouched built-in must not create an empty entry.
						if (Object.keys(next).length === 0) {
							delete providers[valid.id];
						} else {
							// pi refuses an entry that configures nothing, and the refusal would make
							// every auth check `invalid`: refuse the save instead of writing the file.
							if (!configures(next)) {
								return yield* refusal(
									valid.id,
									`must specify "baseUrl", "headers", "compat", "modelOverrides", or "models".`,
								);
							}
							providers[valid.id] = next;
						}
						return { ...current, providers };
					}),
				)
				.pipe(Effect.catchTags(saveHandlers(valid.id))),
		);

	const remove = (id: string): Effect.Effect<void, ProviderRefused> =>
		Effect.gen(function* () {
			const current = yield* deps.document.read(deps.path).pipe(guarded(id));
			const providers = providersOf(current);
			if (providers[id] === undefined) return;
			const next = { ...providers };
			delete next[id];
			yield* deps.document.write(deps.path, { ...current, providers: next }).pipe(guarded(id));
		});

	const setApiKey = (id: string, apiKey: string): Effect.Effect<void, ProviderRefused> =>
		Effect.flatMap(checkedId(id), (valid) =>
			deps.document
				.update(deps.path, (current) => {
					const providers = providersOf(current);
					return {
						providers: { ...providers, [valid]: { ...entryOf(providers, valid), apiKey } },
					};
				})
				.pipe(guarded(valid)),
		);

	return { customIds, read, remove, save, setApiKey };
};

export const ProvidersStoreLive: Layer.Layer<ProvidersStore, never, AgentHome | JsonDocument> =
	Layer.effect(
		ProvidersStore,
		Effect.gen(function* () {
			const home = yield* AgentHome;
			const document = yield* JsonDocument;
			return makeProvidersStore({ document, path: `${home.agentDir}/models.json` });
		}),
	);
