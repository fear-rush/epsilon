import { Context, Effect, Layer } from "effect";

import type { Readiness } from "#protocol/config/readiness";

import { PiConfig } from "../../platform/pi.ts";
import type { PiConfigApi } from "../../platform/pi.ts";
import { ProvidersStore } from "../providers/store.ts";

/**
 * The readiness answer, from pi's own runtime.
 *
 * The question is pi's: a composition error is `invalid`, a configured provider with a
 * model is ready, and a home with neither is `not_ready`. The engine needs both auth and a
 * model, so a provider with auth alone does not count. Nothing here writes a file; a
 * sign-in from the page or a terminal changes the next answer.
 */

export type ReadinessServiceApi = {
	readonly read: Effect.Effect<Readiness>;
};

export class ReadinessService extends Context.Service<ReadinessService, ReadinessServiceApi>()(
	"epsilon/ReadinessService",
) {}

/** The entry `models.json` declares that pi could not compose; a parse error leaves none. */
const brokenProvider = (
	ids: ReadonlyArray<string>,
	declared: ReadonlySet<string>,
): string | undefined => [...declared].find((id) => !ids.includes(id));

const invalid = (
	ids: ReadonlyArray<string>,
	declared: ReadonlySet<string>,
	answer: { detail: string; fix: string; provider?: string },
): Readiness => {
	const provider = answer.provider ?? brokenProvider(ids, declared);
	const base = { detail: answer.detail, fix: answer.fix, ready: false, status: "invalid" } as const;
	return provider === undefined ? base : { ...base, provider };
};

export const makeReadinessService = (deps: {
	readonly runtime: PiConfigApi["models"];
	readonly declared: Effect.Effect<ReadonlySet<string>>;
}): ReadinessServiceApi => {
	const read: Effect.Effect<Readiness> = Effect.gen(function* () {
		const composed = yield* deps.runtime.pipe(
			Effect.match({
				onFailure: (failure) => ({ failure }),
				onSuccess: (runtime) => ({ runtime }),
			}),
		);
		const declared = yield* deps.declared;
		if ("failure" in composed) {
			return invalid([], declared, {
				detail: `pi could not build its model runtime: ${composed.failure.reason}`,
				fix: "Fix models.json or auth.json, then reload.",
			});
		}
		const runtime = composed.runtime;
		const ids = runtime.getProviders().map((provider) => provider.id);
		const error = runtime.getError();
		if (error !== undefined) {
			return invalid(ids, declared, {
				detail: error,
				fix: "Fix the entry in models.json, then reload.",
			});
		}

		const configured = runtime
			.getProviders()
			.filter((provider) => runtime.getProviderAuthStatus(provider.id).configured);
		const results = yield* Effect.forEach(
			configured,
			(provider) =>
				Effect.tryPromise({
					try: () => runtime.checkAuth(provider.id),
					catch: (cause) => ({
						answer: invalid(ids, declared, {
							detail: `${provider.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
							fix: "Fix this provider in Settings.",
							provider: provider.id,
						}),
					}),
				}).pipe(
					Effect.match({
						onFailure: (failed) => ({ answer: failed.answer }),
						onSuccess: (auth) => ({ auth, provider }),
					}),
				),
			{ concurrency: 4 },
		);

		for (const result of results) {
			if ("answer" in result) return result.answer;
			if (runtime.getModels(result.provider.id).length > 0) return { ready: true } as const;
		}
		return {
			detail:
				configured.length > 0
					? "A configured provider has no model to run."
					: "No provider is configured.",
			fix:
				configured.length > 0
					? "Add a model to it in Settings."
					: "Add a provider in Settings, or run `pi auth login`.",
			ready: false,
			status: "not_ready",
		} as const;
	});

	return { read };
};

export const ReadinessServiceLive: Layer.Layer<ReadinessService, never, PiConfig | ProvidersStore> =
	Layer.effect(
		ReadinessService,
		Effect.gen(function* () {
			const config = yield* PiConfig;
			const providers = yield* ProvidersStore;
			return makeReadinessService({
				declared: providers.customIds,
				runtime: config.models,
			});
		}),
	);
