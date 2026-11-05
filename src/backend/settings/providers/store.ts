import { Context, Effect, Layer, Schema } from "effect";

import { isBaseUrl, isProviderApi, isProviderId } from "#domain/providers/rules";
import { ThinkingLevel } from "#protocol/conversation/session";
import { ProviderRefused } from "#protocol/errors";
import type {
	ModelInputLimits,
	ModelPromptCache,
	ProviderInput,
	ProviderModelCost,
	ProviderModelInput,
	ProviderStored,
	ReasoningCompat,
	SamplingParamsByThinkingLevel,
	ThinkingLevelMap,
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

export type ProvidersStoreApi = {
	/** The provider ids `models.json` declares, which are the ones this page may edit. */
	readonly customIds: Effect.Effect<ReadonlySet<string>>;
	/** The stored entry's editable fields, with the key reduced to its form. */
	readonly read: (id: string) => Effect.Effect<ProviderStored, ProviderRefused>;
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

/** A model's four rates and its tiers as the file writes them. */
const costOf = (cost: ProviderModelCost): JsonObject => {
	const next: JsonObject = {
		cacheRead: cost.cacheRead,
		cacheWrite: cost.cacheWrite,
		input: cost.input,
		output: cost.output,
	};
	if (cost.tiers !== undefined) {
		next["tiers"] = cost.tiers.map((tier) => ({
			cacheRead: tier.cacheRead,
			cacheWrite: tier.cacheWrite,
			input: tier.input,
			inputTokensAbove: tier.inputTokensAbove,
			output: tier.output,
		}));
	}
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
 * Write one payload-owned field. `emptyIsValue` marks the fields where `[]`, `""` or `0`
 * is a real answer: an empty input list means text only, and a cleared family is empty.
 */
const writeField = (
	next: JsonObject,
	key: string,
	value: JsonValue | undefined,
	emptyIsValue: boolean,
): void => {
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
const mergeModel = (stored: JsonObject, input: ProviderModelInput): JsonObject => {
	const next: JsonObject = { ...stored, id: input.id };
	writeField(next, "name", input.name, false);
	writeField(next, "api", input.api, true);
	writeField(next, "baseUrl", input.baseUrl, false);
	writeField(next, "reasoning", input.reasoning, true);
	writeField(next, "thinkingLevelMap", whenDefined(input.thinkingLevelMap, levelMapOf), false);
	writeField(next, "compat", whenDefined(input.compat, compatOf), false);
	writeField(next, "input", input.input === undefined ? undefined : [...input.input], true);
	writeField(next, "inputLimits", whenDefined(input.inputLimits, limitsOf), false);
	writeField(next, "promptCache", whenDefined(input.promptCache, promptCacheOf), false);
	writeField(next, "samplingParams", whenDefined(input.samplingParams, jsonValueOf), false);
	writeField(
		next,
		"samplingParamsByThinkingLevel",
		whenDefined(input.samplingParamsByThinkingLevel, samplingByLevelOf),
		false,
	);
	writeField(next, "contextWindow", input.contextWindow, true);
	writeField(next, "maxTokens", input.maxTokens, true);
	writeField(next, "cost", whenDefined(input.cost, costOf), false);
	const headers = mergeHeaders(input.headers, stringMapOf(stored["headers"]));
	if (headers === undefined) delete next["headers"];
	else next["headers"] = headers;
	return next;
};

/** Every platform failure becomes the refusal the page shows, naming this provider. */
const guarded =
	(id: string) =>
	<A>(
		effect: Effect.Effect<A, FileUnreadable | FileUnwritable | Locked | NotJson>,
	): Effect.Effect<A, ProviderRefused> =>
		effect.pipe(
			Effect.catchTags({
				FileUnreadable: (error) => Effect.fail(refusal(id, error.reason)),
				FileUnwritable: (error) => Effect.fail(refusal(id, error.reason)),
				Locked: () => Effect.fail(refusal(id, "models.json is locked; try again.")),
				NotJson: (error) =>
					Effect.fail(refusal(id, `models.json could not be read: ${error.reason}`)),
			}),
		);

/** The three checks a provider passes before any file is touched. */
const checked = (input: ProviderInput): Effect.Effect<ProviderInput, ProviderRefused> => {
	if (!isProviderId(input.id)) {
		return Effect.fail(
			refusal(input.id, "The provider id may hold letters, digits, dots, dashes and underscores."),
		);
	}
	if (!isProviderApi(input.api)) {
		return Effect.fail(refusal(input.id, `${input.api} is not one of pi's API families.`));
	}
	if (!isBaseUrl(input.baseUrl)) {
		return Effect.fail(refusal(input.id, "The base URL must start with http:// or https://."));
	}
	return Effect.succeed(input);
};

const checkedId = (id: string): Effect.Effect<string, ProviderRefused> =>
	isProviderId(id) ? Effect.succeed(id) : Effect.fail(refusal(id, "That is not a provider id."));

/** A stored key's form; the value itself never leaves the file. */
const keyForm = (value: JsonValue | undefined): ProviderStored["apiKeyForm"] => {
	if (!Schema.is(Schema.String)(value)) return undefined;
	if (value.startsWith("$")) return "environment";
	if (value.startsWith("!")) return "command";
	return "literal";
};

/** The stored fields, built one at a time so an absent one stays absent. */
type StoredFields = {
	name?: string;
	baseUrl?: string;
	api?: string;
	apiKeyForm?: ProviderStored["apiKeyForm"];
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

	const read = (id: string): Effect.Effect<ProviderStored, ProviderRefused> =>
		Effect.flatMap(checkedId(id), (valid) =>
			deps.document.read(deps.path).pipe(
				guarded(valid),
				Effect.map((document) => {
					const entry = entryOf(providersOf(document), valid);
					const name = entry["name"];
					const baseUrl = entry["baseUrl"];
					const api = entry["api"];
					const form = keyForm(entry["apiKey"]);
					const stored: StoredFields = {};
					if (Schema.is(Schema.String)(name)) stored.name = name;
					if (Schema.is(Schema.String)(baseUrl)) stored.baseUrl = baseUrl;
					if (Schema.is(Schema.String)(api)) stored.api = api;
					if (form !== undefined) stored.apiKeyForm = form;
					return stored;
				}),
			),
		);

	const save = (input: ProviderInput): Effect.Effect<void, ProviderRefused> =>
		Effect.flatMap(checked(input), (valid) =>
			deps.document
				.update(deps.path, (current) => {
					const providers = providersOf(current);
					const entry = entryOf(providers, valid.id);
					const kept = new Map<string, JsonObject>();
					for (const model of modelsOf(entry)) {
						const modelId = model["id"];
						if (Schema.is(Schema.String)(modelId)) kept.set(modelId, model);
					}
					const models = valid.models.map((model) => mergeModel(kept.get(model.id) ?? {}, model));
					const next: JsonObject = {
						...entry,
						api: valid.api,
						baseUrl: valid.baseUrl,
						models,
						name: valid.name,
					};
					if (valid.apiKey !== undefined) next["apiKey"] = valid.apiKey;
					return { providers: { ...providers, [valid.id]: next } };
				})
				.pipe(guarded(valid.id)),
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
