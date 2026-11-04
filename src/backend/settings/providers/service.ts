import { Context, Effect, Layer, Option, Ref } from "effect";

import { ProviderRefused } from "#protocol/errors";
import type {
	ProviderDetail,
	ProviderInput,
	ProviderModelsView,
	ProviderRow,
	ProvidersView,
} from "#protocol/settings/providers";

import type { RuntimeUnavailable } from "../../platform/errors.ts";
import { Log } from "../../platform/log.ts";
import type { LogApi } from "../../platform/log.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { ModelRuntime } from "../../platform/pi.ts";
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
};

export class ProvidersService extends Context.Service<ProvidersService, ProvidersServiceApi>()(
	"epsilon/ProvidersService",
) {}

/** The auth row built a field at a time, so an absent label stays absent. */
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
					custom: (yield* deps.store.customIds).has(id),
					id,
					models: runtime.getModels(id).map((model) => ({
						contextWindow: model.contextWindow,
						id: model.id,
						maxTokens: model.maxTokens,
						name: model.name,
					})),
					name: provider.name,
					stored: Object.keys(stored).length === 0 ? null : stored,
				} satisfies ProviderDetail;
			});

		return {
			list,
			models,
			read,
			remove: deps.store.remove,
			save: deps.store.save,
			setApiKey: deps.store.setApiKey,
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
