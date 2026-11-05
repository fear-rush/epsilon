import { describe, expect } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Ref, Schema } from "effect";

import { ProviderRefused } from "#protocol/errors";
import { ProviderRpcs } from "#protocol/settings/providers";

import { writeStubModels } from "../../../../test/e2e/stub-model.ts";
import { itEffect } from "../../../../test/effect.ts";
import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { RuntimeUnavailable } from "../../platform/errors.ts";
import { JsonDocument, JsonDocumentLive } from "../../platform/json-document.ts";
import { LogLive } from "../../platform/log.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { ProvidersHandlersLive } from "./handlers.ts";
import { makeProvidersService, ProvidersServiceLive } from "./service.ts";
import { makeProvidersStore, ProvidersStoreLive } from "./store.ts";

/**
 * Settings → Providers over the RPC group, against a real `models.json` and pi's own
 * composition. The file is the subject: a custom provider must appear as custom, a save
 * must keep what the dialog does not edit, and a removal must actually remove.
 */

const providerLayer = (name: string) => {
	const agentDir = join(testPaths.scratch, `providers-${name}`);
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	const platform = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
		Layer.provideMerge(AgentHomeLive(agentDir, testPaths.sandboxHome)),
		Layer.provideMerge(BunServices.layer),
	);
	const config = PiConfigLive.pipe(Layer.provideMerge(platform));
	return {
		agentDir,
		file: join(agentDir, "models.json"),
		layer: ProvidersStoreLive.pipe(
			Layer.provideMerge(platform),
			Layer.provideMerge(
				ProvidersServiceLive.pipe(
					Layer.provideMerge(platform),
					Layer.provideMerge(config),
					Layer.provideMerge(ProvidersStoreLive.pipe(Layer.provideMerge(platform))),
				),
			),
		),
	};
};

/** One file entry with the fields a check reads, and every other key kept as it is. */
const Entry = Schema.StructWithRest(
	Schema.Struct({ models: Schema.optional(Schema.Array(Schema.Json)) }),
	[Schema.Record(Schema.String, Schema.Json)],
);

const ModelsFile = Schema.Struct({ providers: Schema.Record(Schema.String, Entry) });

const readFile = (path: string) =>
	Schema.decodeUnknownSync(ModelsFile)(JSON.parse(readFileSync(path, "utf8")));

describe("settings.providers", () => {
	itEffect(
		"lists pi's providers and names the one models.json declares",
		() => {
			const { agentDir, layer } = providerLayer("list");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const view = yield* client["settings.providers.list"]();
				const stub = view.providers.find((provider) => provider.id === "stub");
				expect(stub?.custom).toBe(true);
				expect(stub?.builtin).toBe(false);
				expect(stub?.models).toBe(1);
				// pi's own catalog is in the same list, marked built in.
				const builtin = view.providers.find((provider) => provider.id === "anthropic");
				expect(builtin?.builtin).toBe(true);
				expect(builtin?.custom).toBe(false);
				// No credential is configured for a file-only provider, and no secret is on the wire.
				expect(stub?.auth).toEqual({ configured: true, source: "models_json_key" });
				expect(JSON.stringify(view)).not.toContain("stub-key");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"saves a provider without dropping the keys the dialog does not edit",
		() => {
			const { agentDir, file, layer } = providerLayer("save");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			writeFileSync(
				file,
				`${JSON.stringify(
					{
						providers: {
							stub: {
								api: "openai-completions",
								apiKey: "stub-key",
								baseUrl: "http://127.0.0.1:1",
								models: [{ extra: "kept", id: "stub-model" }],
								name: "Stub",
								note: "kept",
							},
						},
					},
					null,
					2,
				)}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				yield* client["settings.providers.save"]({
					api: "openai-completions",
					baseUrl: "http://127.0.0.1:2",
					id: "stub",
					models: [
						{
							compat: { thinkingFormat: "openai" },
							contextWindow: 2000,
							cost: {
								cacheRead: 0.1,
								cacheWrite: 0.2,
								input: 1,
								output: 2,
								tiers: [
									{
										cacheRead: 0,
										cacheWrite: 0,
										input: 1,
										inputTokensAbove: 200000,
										output: 2,
									},
								],
							},
							headers: { "X-Header": "value" },
							id: "stub-model",
							input: ["text", "image"],
							inputLimits: { images: { resize: { maxWidth: 800 } }, maxRequestBytes: 1000 },
							maxTokens: 100,
							name: "Stub",
							promptCache: { short: 5 },
							reasoning: true,
							samplingParams: { temperature: 0.2 },
							samplingParamsByThinkingLevel: { high: { top_p: 0.9 } },
							thinkingLevelMap: { high: "high", off: null },
						},
					],
					name: "Stub Renamed",
				});
				const stored = readFile(file).providers["stub"];
				expect(stored).toMatchObject({
					baseUrl: "http://127.0.0.1:2",
					name: "Stub Renamed",
					note: "kept",
				});
				expect(stored?.["models"]).toEqual([
					{
						compat: { thinkingFormat: "openai" },
						contextWindow: 2000,
						cost: {
							cacheRead: 0.1,
							cacheWrite: 0.2,
							input: 1,
							output: 2,
							tiers: [
								{
									cacheRead: 0,
									cacheWrite: 0,
									input: 1,
									inputTokensAbove: 200000,
									output: 2,
								},
							],
						},
						extra: "kept",
						headers: { "X-Header": "value" },
						id: "stub-model",
						input: ["text", "image"],
						inputLimits: { images: { resize: { maxWidth: 800 } }, maxRequestBytes: 1000 },
						maxTokens: 100,
						name: "Stub",
						promptCache: { short: 5 },
						reasoning: true,
						samplingParams: { temperature: 0.2 },
						samplingParamsByThinkingLevel: { high: { top_p: 0.9 } },
						thinkingLevelMap: { high: "high", off: null },
					},
				]);

				// A model entry is a complete record: what the payload leaves out is unset, while
				// a blank header value keeps the stored one and keys this version does not model stay.
				yield* client["settings.providers.save"]({
					api: "openai-completions",
					baseUrl: "http://127.0.0.1:2",
					id: "stub",
					models: [{ headers: { "X-Header": "" }, id: "stub-model" }],
					name: "Stub Renamed",
				});
				expect(readFile(file).providers["stub"]?.["models"]).toEqual([
					{ extra: "kept", headers: { "X-Header": "value" }, id: "stub-model" },
				]);

				// A cleared list and `false` are answers, not empty controls.
				yield* client["settings.providers.save"]({
					api: "openai-completions",
					baseUrl: "http://127.0.0.1:2",
					id: "stub",
					models: [{ id: "stub-model", input: [], reasoning: false }],
					name: "Stub Renamed",
				});
				expect(readFile(file).providers["stub"]?.["models"]).toEqual([
					{ extra: "kept", id: "stub-model", input: [], reasoning: false },
				]);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"refuses a bad family or base URL before writing",
		() => {
			const { layer } = providerLayer("refused");
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const family = yield* Effect.flip(
					client["settings.providers.save"]({
						api: "not-an-api",
						baseUrl: "http://127.0.0.1:1",
						id: "stub",
						models: [{ id: "m" }],
						name: "Stub",
					}),
				);
				expect(family).toBeInstanceOf(ProviderRefused);
				expect(family.reason).toContain("API families");
				const url = yield* Effect.flip(
					client["settings.providers.save"]({
						api: "openai-completions",
						baseUrl: "ftp://example",
						id: "stub",
						models: [{ id: "m" }],
						name: "Stub",
					}),
				);
				expect(url.reason).toContain("http");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		10000,
	);

	itEffect(
		"removes one provider and keeps the others",
		() => {
			const { agentDir, file, layer } = providerLayer("remove");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				yield* client["settings.providers.save"]({
					api: "openai-completions",
					baseUrl: "http://127.0.0.1:1",
					id: "other",
					models: [{ id: "other-model" }],
					name: "Other",
				});
				yield* client["settings.providers.remove"]({ id: "stub" });
				const after = readFile(file);
				expect(after.providers["stub"]).toBeUndefined();
				expect(after.providers["other"]).toBeDefined();
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"sets an endpoint key and leaves the rest of the entry alone",
		() => {
			const { agentDir, file, layer } = providerLayer("api-key");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				yield* client["settings.providers.setApiKey"]({ apiKey: "$MY_KEY", id: "stub" });
				expect(readFile(file).providers["stub"]).toMatchObject({
					apiKey: "$MY_KEY",
					baseUrl: "http://127.0.0.1:1",
					models: [{}],
				});
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"the built-in id cache keeps only a resolved list (F8l)",
		() =>
			Effect.gen(function* () {
				const document = yield* JsonDocument;
				const runtime = yield* Effect.tryPromise(() =>
					ModelRuntime.create({ modelsPath: null, refreshOnCreate: false }),
				);
				const ids = new Set(runtime.getProviders().map((row) => row.id));
				const attempts = yield* Ref.make(0);
				const store = makeProvidersStore({
					document,
					path: join(testPaths.scratch, "providers-f8l", "models.json"),
				});
				const service = yield* makeProvidersService({
					builtin: Effect.gen(function* () {
						const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1);
						if (attempt === 1) {
							return yield* new RuntimeUnavailable({ reason: "the first attempt fails" });
						}
						return ids;
					}),
					log: { engine: () => ({ write: () => Effect.void }), write: () => Effect.void },
					runtime: Effect.succeed(runtime),
					store,
				});

				// The first call could not read the ids, so it shows what it knows.
				const first = yield* service.list;
				expect(first.providers.find((row) => row.id === "anthropic")?.builtin).toBe(false);

				// The second call tried again instead of remembering the failure.
				const second = yield* service.list;
				expect(second.providers.find((row) => row.id === "anthropic")?.builtin).toBe(true);
				expect(yield* Ref.get(attempts)).toBe(2);
			}).pipe(Effect.provide(JsonDocumentLive.pipe(Layer.provideMerge(BunServices.layer)))),
		10000,
	);
});
