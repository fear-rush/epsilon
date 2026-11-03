import { Context, Effect, Layer, Schema } from "effect";

import { isBaseUrl, isProviderApi, isProviderId } from "#domain/providers/rules";
import type { ProviderInput } from "#protocol/config/providers";
import { ProviderRefused } from "#protocol/errors";

import { AgentHome } from "../../platform/agent-home.ts";
import type { FileUnreadable, FileUnwritable, Locked, NotJson } from "../../platform/errors.ts";
import { JsonDocument } from "../../platform/json-document.ts";
import type { JsonDocumentApi, JsonObject } from "../../platform/json-document.ts";
import { isJsonObject } from "../../platform/patch.ts";

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
					const models = valid.models.map((model) => {
						const previous = kept.get(model.id) ?? {};
						const next: JsonObject = { ...previous, id: model.id };
						if (model.name !== undefined) next["name"] = model.name;
						if (model.contextWindow !== undefined) next["contextWindow"] = model.contextWindow;
						if (model.maxTokens !== undefined) next["maxTokens"] = model.maxTokens;
						return next;
					});
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

	return { customIds, remove, save, setApiKey };
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
