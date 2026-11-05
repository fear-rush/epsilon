import { Context, Effect, Layer, Option, Ref, Schema } from "effect";

import { isProviderApi } from "#domain/providers/rules";
import { ProviderRefused } from "#protocol/errors";
import { ProviderCatalogModel } from "#protocol/settings/providers";
import type {
	ProviderCatalogModel as CatalogModel,
	ProviderDetail,
	ProviderImportInput,
	ProviderInput,
	ProviderModelInput,
	ProviderModelsView,
	ProviderRow,
	ProviderTestInput,
	ProviderTestResult,
	ProvidersView,
} from "#protocol/settings/providers";

import type { RuntimeUnavailable } from "../../platform/errors.ts";
import { Log } from "../../platform/log.ts";
import type { LogApi } from "../../platform/log.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { ModelRuntime } from "../../platform/pi.ts";
import { importModelsFor } from "./import.ts";
import { testProvider } from "./probe.ts";
import { ProvidersStore } from "./store.ts";
import type { ProvidersStoreApi } from "./store.ts";

/**
 * What pi composed for this home, and the `models.json` edits behind it.
 *
 * The built-in id list comes from a second runtime with no `models.json` (F8l). It is
 * cached only once it resolves: a failed attempt is retried on the next call instead of
 * holding a rejection for the life of the process, which is what the old dashboard did.
 */

export type ProvidersServiceApi = {
	readonly list: Effect.Effect<ProvidersView>;
	readonly models: Effect.Effect<ProviderModelsView>;
	readonly read: (id: string) => Effect.Effect<ProviderDetail, ProviderRefused>;
	readonly save: (input: ProviderInput) => Effect.Effect<void, ProviderRefused>;
	readonly remove: (id: string) => Effect.Effect<void, ProviderRefused>;
	readonly setApiKey: (id: string, apiKey: string) => Effect.Effect<void, ProviderRefused>;
	/** The provider's own model list, read over the web with the key or the credential. */
	readonly import: (
		input: ProviderImportInput,
	) => Effect.Effect<ReadonlyArray<ProviderModelInput>, ProviderRefused>;
	/** One draft's model, tried through pi's client before the entry is saved. */
	readonly test: (input: ProviderTestInput) => Effect.Effect<ProviderTestResult, ProviderRefused>;
};

export class ProvidersService extends Context.Service<ProvidersService, ProvidersServiceApi>()(
	"epsilon/ProvidersService",
) {}

/** One model pi composed, without importing pi's own type into this feature. */
type RuntimeModel = ReturnType<ModelRuntime["getModels"]>[number];

/**
 * One composed model as the page seeds an override from. pi composes more families than
 * the four the dialog edits, so a family this version does not know travels as no family
 * at all instead of hiding the model.
 */
const catalogModelOf = (provider: string, model: RuntimeModel): Option.Option<CatalogModel> =>
	Schema.decodeUnknownOption(ProviderCatalogModel)({
		...model,
		api: isProviderApi(model.api) ? model.api : undefined,
		provider,
	});

type MutableAuth = {
	configured: boolean;
	source?: string;
	label?: string;
};

const rowsOf = (
	runtime: ModelRuntime,
	builtin: ReadonlySet<string>,
	custom: ReadonlySet<string>,
): ReadonlyArray<ProviderRow> =>
	runtime.getProviders().map((provider) => rowOf(runtime, builtin, custom, provider));

const rowOf = (
	runtime: ModelRuntime,
	builtin: ReadonlySet<string>,
	custom: ReadonlySet<string>,
	provider: { readonly id: string; readonly name: string },
): ProviderRow => {
	const auth = runtime.getProviderAuthStatus(provider.id);
	const base = { configured: auth.configured };
	const withSource = auth.source === undefined ? base : { ...base, source: auth.source };
	const authRow = auth.label === undefined ? withSource : { ...withSource, label: auth.label };
	return {
		auth: authRow,
		builtin: builtin.has(provider.id),
		custom: custom.has(provider.id),
		id: provider.id,
		models: runtime.getModels(provider.id).length,
		name: provider.name,
	};
};

export const makeProvidersService = (deps: {
	readonly runtime: Effect.Effect<ModelRuntime, RuntimeUnavailable>;
	readonly builtin: Effect.Effect<ReadonlySet<string>, RuntimeUnavailable>;
	readonly store: ProvidersStoreApi;
	readonly log: LogApi;
}): Effect.Effect<ProvidersServiceApi> =>
	Effect.gen(function* () {
		const cached = yield* Ref.make<Option.Option<ReadonlySet<string>>>(Option.none());

		const builtinIds: Effect.Effect<ReadonlySet<string>, { readonly reason: string }> = Effect.gen(
			function* () {
				const known = yield* Ref.get(cached);
				if (Option.isSome(known)) return known.value;
				const ids = yield* deps.builtin.pipe(
					Effect.mapError((error) => ({ reason: error.reason })),
				);
				// Only a resolved set is cached: a failure must be retried, never remembered.
				yield* Ref.set(cached, Option.some(ids));
				return ids;
			},
		);

		const list: Effect.Effect<ProvidersView> = Effect.gen(function* () {
			const composed = yield* deps.runtime.pipe(
				Effect.asSome,
				Effect.catchTag("RuntimeUnavailable", (error) =>
					deps.log
						.write("error", "pi could not compose the model catalog", { reason: error.reason })
						.pipe(Effect.as(Option.none<ModelRuntime>())),
				),
			);
			if (Option.isNone(composed)) return { providers: [] };
			const runtime = composed.value;
			const custom = yield* deps.store.customIds;
			const builtin = yield* builtinIds.pipe(
				Effect.matchEffect({
					onFailure: (error) =>
						deps.log
							.write("warn", "the built-in provider ids could not be read", {
								reason: error.reason,
							})
							.pipe(Effect.as(new Set<string>())),
					onSuccess: (ids) => Effect.succeed(ids),
				}),
			);
			const error = runtime.getError();
			return error === undefined
				? { providers: rowsOf(runtime, builtin, custom) }
				: { error, providers: rowsOf(runtime, builtin, custom) };
		});

		const models: Effect.Effect<ProviderModelsView> = deps.runtime.pipe(
			Effect.map((runtime) => ({
				models: runtime.getModels().map((model) => ({
					id: model.id,
					name: model.name,
					provider: model.provider,
				})),
			})),
			Effect.catchTag("RuntimeUnavailable", (error) =>
				deps.log
					.write("error", "pi could not compose the model catalog", { reason: error.reason })
					.pipe(Effect.as({ models: [] })),
			),
		);

		/** Every composed model the page can describe; one it cannot is a warning, not a hole. */
		const catalogOf = (runtime: ModelRuntime, provider: string) =>
			Effect.gen(function* () {
				const entries: CatalogModel[] = [];
				for (const model of runtime.getModels(provider)) {
					const decoded = catalogModelOf(provider, model);
					if (Option.isSome(decoded)) entries.push(decoded.value);
					else {
						yield* deps.log.write("warn", "a composed model could not be described", {
							model: model.id,
							provider,
						});
					}
				}
				return entries;
			});

		const read: ProvidersServiceApi["read"] = (id) =>
			Effect.gen(function* () {
				const runtime = yield* deps.runtime.pipe(
					Effect.mapError(
						(error) =>
							new ProviderRefused({
								providerId: id,
								reason: `pi could not compose its catalog: ${error.reason}`,
							}),
					),
				);
				const provider = runtime.getProviders().find((entry) => entry.id === id);
				if (provider === undefined) {
					return yield* new ProviderRefused({ providerId: id, reason: `pi does not know ${id}` });
				}
				const stored = yield* deps.store.read(id);
				const auth = runtime.getProviderAuthStatus(id);
				const authRow: MutableAuth = { configured: auth.configured };
				if (auth.source !== undefined) authRow.source = auth.source;
				if (auth.label !== undefined) authRow.label = auth.label;
				return {
					auth: authRow,
					builtin: (yield* builtinIds.pipe(
						Effect.match({
							onFailure: () => new Set<string>(),
							onSuccess: (ids) => ids,
						}),
					)).has(id),
					// The composed model, so the override dialog seeds from pi's effective values.
					catalog: yield* catalogOf(runtime, id),
					custom: (yield* deps.store.customIds).has(id),
					headerKeys: stored.headerKeys,
					id,
					modelOverrides: stored.modelOverrides,
					models: stored.models,
					name: provider.name,
					stored: stored.stored,
				} satisfies ProviderDetail;
			});

		const importModels: ProvidersServiceApi["import"] = (input) =>
			deps.runtime.pipe(
				Effect.mapError(
					(error) =>
						new ProviderRefused({
							providerId: input.providerId ?? input.baseUrl,
							reason: `pi could not compose its catalog: ${error.reason}`,
						}),
				),
				Effect.flatMap((runtime) => importModelsFor(runtime, deps.store, input)),
			);

		const test: ProvidersServiceApi["test"] = (input) =>
			Effect.gen(function* () {
				const authHeader =
					input.providerId === undefined
						? false
						: (yield* deps.store.read(input.providerId)).stored.authHeader === true;
				return yield* testProvider(input, { authHeader, runtime: deps.runtime });
			});

		return {
			import: importModels,
			list,
			models,
			read,
			remove: deps.store.remove,
			save: deps.store.save,
			setApiKey: deps.store.setApiKey,
			test,
		} satisfies ProvidersServiceApi;
	});

export const ProvidersServiceLive: Layer.Layer<
	ProvidersService,
	never,
	PiConfig | ProvidersStore | Log
> = Layer.effect(
	ProvidersService,
	Effect.gen(function* () {
		const config = yield* PiConfig;
		const store = yield* ProvidersStore;
		const log = yield* Log;
		return yield* makeProvidersService({
			builtin: config.builtinModels.pipe(
				Effect.map((runtime) => new Set(runtime.getProviders().map((row) => row.id))),
			),
			log,
			runtime: config.models,
			store,
		});
	}),
);
