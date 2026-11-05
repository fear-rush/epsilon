import { Context, Effect, Layer, Option, Ref, Schema } from "effect";

import { isProviderApi } from "#domain/providers/rules";
import { ProviderRefused } from "#protocol/errors";
import { ProviderCatalogModel } from "#protocol/settings/providers";
import type {
	BuiltinProvider,
	ProviderCatalogModel as CatalogModel,
	ProviderDetail,
	ProviderImportInput,
	ProviderInput,
	ProviderLoginType,
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
	/** Remove the credential `auth.json` holds, leaving the `models.json` entry in place. */
	readonly logout: (id: string) => Effect.Effect<void, ProviderRefused>;
};

export class ProvidersService extends Context.Service<ProvidersService, ProvidersServiceApi>()(
	"epsilon/ProvidersService",
) {}

/** One model pi composed, without importing pi's own type into this feature. */
type RuntimeModel = ReturnType<ModelRuntime["getModels"]>[number];

/** A provider as the runtime returns it, without importing pi's own type here. */
type RuntimeProvider = NonNullable<ReturnType<ModelRuntime["getProvider"]>>;

/** The account pi declares for a provider, in the shape the page draws. */
const oauthOf = (provider: RuntimeProvider): ProviderDetail["auth"]["oauth"] => {
	const oauth = provider.auth.oauth;
	if (oauth === undefined) return undefined;
	return {
		label: oauth.loginLabel,
		name: oauth.name,
		subscription: oauth.isSubscription === true,
	};
};

/** pi's API-key method. Ambient-only providers omit `login`, so the page cannot start one. */
const apiKeyOf = (provider: RuntimeProvider): ProviderDetail["auth"]["apiKey"] => {
	const apiKey = provider.auth.apiKey;
	if (apiKey === undefined) return undefined;
	return { interactive: apiKey.login !== undefined, name: apiKey.name };
};

/** The device credential pi lists for one provider, which it uses ahead of a file key. */
const credentialOf = (
	runtime: ModelRuntime,
	id: string,
): Effect.Effect<ProviderDetail["auth"]["credential"], ProviderRefused> =>
	Effect.tryPromise({
		try: () => runtime.listCredentials(),
		catch: (cause) =>
			new ProviderRefused({
				providerId: id,
				reason: `The stored credentials could not be read (${cause instanceof Error ? cause.message : String(cause)}).`,
			}),
	}).pipe(Effect.map((credentials) => credentials.find((entry) => entry.providerId === id)?.type));

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

/**
 * The providers the page lists: ones a `models.json` entry or a credential configures.
 * pi ships many more, and they belong in the add picker, not in a page of configured ones.
 */
const rowsOf = (
	runtime: ModelRuntime,
	builtin: ReadonlySet<string>,
	custom: ReadonlySet<string>,
): ReadonlyArray<ProviderRow> =>
	runtime
		.getProviders()
		.filter(
			(provider) =>
				custom.has(provider.id) || runtime.getProviderAuthStatus(provider.id).configured,
		)
		.map((provider) => rowOf(runtime, builtin, custom, provider));

/** Every provider pi knows, for the add picker, in the order the picker draws them. */
const builtinsOf = (
	runtime: ModelRuntime,
	custom: ReadonlySet<string>,
	credentials: ReadonlyMap<string, ProviderLoginType>,
): ReadonlyArray<BuiltinProvider> =>
	runtime
		.getProviders()
		.map((provider) => ({
			auth: {
				apiKey: apiKeyOf(provider),
				credential: credentials.get(provider.id),
				oauth: oauthOf(provider),
			},
			configured: custom.has(provider.id) || runtime.getProviderAuthStatus(provider.id).configured,
			id: provider.id,
			name: provider.name,
		}))
		.toSorted((left, right) => left.name.localeCompare(right.name));

/**
 * Every stored credential, keyed by provider. The add picker's badge reads it, so a
 * failure names its reason in the log and leaves the badge at `configured`: the list is
 * still the page's answer, and losing it over a badge would be worse.
 */
const credentialsOf = (
	runtime: ModelRuntime,
	log: LogApi,
): Effect.Effect<ReadonlyMap<string, ProviderLoginType>> =>
	Effect.tryPromise({
		try: () => runtime.listCredentials(),
		catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
	}).pipe(
		Effect.map(
			(credentials) => new Map(credentials.map((entry) => [entry.providerId, entry.type] as const)),
		),
		Effect.matchEffect({
			onFailure: (reason) =>
				log
					.write("warn", "the stored credentials could not be read", { reason })
					.pipe(Effect.as(new Map<string, ProviderLoginType>())),
			onSuccess: (credentials) => Effect.succeed(credentials),
		}),
	);

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
			if (Option.isNone(composed)) return { builtins: [], providers: [] };
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
			const view: ProvidersView = {
				builtins: builtinsOf(runtime, custom, yield* credentialsOf(runtime, deps.log)),
				providers: rowsOf(runtime, builtin, custom),
			};
			const error = runtime.getError();
			return error === undefined ? view : { ...view, error };
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
				const providerApi = stored.stored.api;
				const api =
					providerApi !== undefined && isProviderApi(providerApi) ? providerApi : undefined;
				return {
					auth: {
						apiKey: apiKeyOf(provider),
						credential: yield* credentialOf(runtime, id),
						oauth: oauthOf(provider),
					},
					// The effective endpoint: the entry's, then pi's own for a built-in.
					baseUrl: stored.stored.baseUrl ?? provider.baseUrl,
					configured: auth.configured,
					builtin: (yield* builtinIds.pipe(
						Effect.match({
							onFailure: () => new Set<string>(),
							onSuccess: (ids) => ids,
						}),
					)).has(id),
					// The composed model, so the override dialog seeds from pi's effective values.
					catalog: yield* catalogOf(runtime, id),
					custom: (yield* deps.store.customIds).has(id),
					hasKey: stored.hasKey,
					headerKeys: stored.headerKeys,
					id,
					api,
					modelOverrides: stored.modelOverrides,
					models: stored.models,
					name: provider.name,
					source: auth.source,
					sourceLabel: auth.label,
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

		const logout: ProvidersServiceApi["logout"] = (id) =>
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
				const credential = yield* credentialOf(runtime, id);
				if (credential === undefined) {
					return yield* new ProviderRefused({
						providerId: id,
						reason: "This provider has no stored credential to remove.",
					});
				}
				yield* Effect.tryPromise({
					catch: (cause) =>
						new ProviderRefused({
							providerId: id,
							reason: cause instanceof Error ? cause.message : String(cause),
						}),
					try: () => runtime.logout(id),
				});
				return undefined;
			});

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
			logout,
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
