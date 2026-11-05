import { describe, expect } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Option, Ref, Schema } from "effect";

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

/** The two request fields these tests read. */
const RequestBody = Schema.Struct({
	model: Schema.optional(Schema.String),
	reasoning_effort: Schema.optional(Schema.String),
});

/** One assistant turn, as every OpenAI-compatible endpoint streams it. */
const streamOf = (chunks: ReadonlyArray<unknown>): string =>
	[...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join("");

const openaiStream = (): string =>
	streamOf([
		{
			choices: [{ delta: { content: "ok", role: "assistant" }, finish_reason: null, index: 0 }],
			created: 0,
			id: "chatcmpl-test",
			model: "m",
			object: "chat.completion.chunk",
		},
		{
			choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
			created: 0,
			id: "chatcmpl-test",
			model: "m",
			object: "chat.completion.chunk",
			usage: { completion_tokens: 1, prompt_tokens: 3, total_tokens: 4 },
		},
	]);

const reasoningStream = (): string =>
	streamOf([
		{
			choices: [
				{ delta: { reasoning_content: "abc", role: "assistant" }, finish_reason: null, index: 0 },
			],
			created: 0,
			id: "chatcmpl-test",
			model: "m",
			object: "chat.completion.chunk",
		},
		{
			choices: [{ delta: { content: "ok" }, finish_reason: "stop", index: 0 }],
			created: 0,
			id: "chatcmpl-test",
			model: "m",
			object: "chat.completion.chunk",
			usage: {
				completion_tokens: 8,
				completion_tokens_details: { reasoning_tokens: 7 },
				prompt_tokens: 3,
				total_tokens: 11,
			},
		},
	]);

const readFile = (path: string) =>
	Schema.decodeUnknownSync(ModelsFile)(JSON.parse(readFileSync(path, "utf8")));

describe("settings.providers", () => {
	itEffect(
		"lists the providers a file entry or a credential configures, and every builtin to add",
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
				// A provider pi merely ships is not the page's business: it belongs in the add picker.
				for (const provider of view.providers) {
					expect(provider.custom || provider.auth.configured).toBe(true);
				}
				// The picker offers pi's whole catalog, saying how each one signs in and where to start.
				const anthropic = view.builtins.find((provider) => provider.id === "anthropic");
				expect(anthropic?.auth.oauth?.name).toBeTruthy();
				expect(view.builtins.find((provider) => provider.id === "stub")?.configured).toBe(true);
				const names = view.builtins.map((provider) => provider.name);
				expect(names).toEqual(names.toSorted((left, right) => left.localeCompare(right)));
				// No credential is configured for a file-only provider, and no secret is on the wire.
				expect(stub?.auth).toEqual({ configured: true, source: "models_json_key" });
				expect(JSON.stringify(view)).not.toContain("stub-key");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"lists a models.json entry pi could not compose, and opens its page",
		() => {
			const { agentDir, file, layer } = providerLayer("uncomposable");
			mkdirSync(agentDir, { recursive: true });
			writeFileSync(
				file,
				`${JSON.stringify({
					providers: {
						broken: { api: "not-an-api", models: [{ id: "x" }], name: "Broken Endpoint" },
					},
				})}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const view = yield* client["settings.providers.list"]();
				// pi refuses the entry without a base URL, so the runtime drops it; the page must not.
				const broken = view.providers.find((provider) => provider.id === "broken");
				expect(broken).toEqual({
					auth: { configured: false },
					builtin: false,
					custom: true,
					id: "broken",
					models: 0,
					name: "Broken Endpoint",
				});
				// The page opens on the file's own fields, which is where the entry gets fixed.
				const detail = yield* client["settings.providers.read"]({ id: "broken" });
				expect(detail).toMatchObject({
					custom: true,
					hasKey: false,
					name: "Broken Endpoint",
				});
				// A family this version does not know leaves the picker unset, as main's did.
				expect(detail.api).toBeUndefined();
				expect(detail.stored.api).toBeUndefined();
				expect(detail.catalog).toEqual([]);
				expect(detail.models).toEqual([{ id: "x" }]);
				expect(detail.auth.oauth).toBeUndefined();
				expect(detail.auth.apiKey).toBeUndefined();
				// Nothing pi never composed is claimed as a provider it knows.
				const refused = yield* Effect.flip(client["settings.providers.read"]({ id: "nobody" }));
				expect(refused).toBeInstanceOf(ProviderRefused);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"reads the entry's models and overrides back, without a stored header's value",
		() => {
			const { agentDir, file, layer } = providerLayer("detail");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			writeFileSync(
				file,
				`${JSON.stringify(
					{
						providers: {
							stub: {
								api: "openai-completions",
								authHeader: false,
								baseUrl: "http://127.0.0.1:1",
								compat: { thinkingFormat: "deepseek" },
								headers: { "X-Key": "header-secret" },
								modelOverrides: { "stub-model": { maxTokens: 100 } },
								models: [
									{
										cost: { cacheRead: 0.1, cacheWrite: 0.2, input: 1, output: 2 },
										headers: { "X-Model": "model-secret" },
										id: "stub-model",
										reasoning: true,
										thinkingLevelMap: { high: "high", off: null },
									},
								],
								name: "Stub",
								oauth: "radius",
							},
						},
					},
					null,
					2,
				)}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const detail = yield* client["settings.providers.read"]({ id: "stub" });
				expect(detail.stored).toMatchObject({
					authHeader: false,
					compat: { thinkingFormat: "deepseek" },
					oauth: "radius",
				});
				expect(detail.headerKeys).toEqual(["X-Key"]);
				// The effective entry and the credential facts the page names.
				expect(detail).toMatchObject({
					api: "openai-completions",
					baseUrl: "http://127.0.0.1:1",
					configured: false,
					hasKey: false,
					name: "Stub",
					// The entry declares radius OAuth, which pi exposes as the provider's sign-in.
					auth: { oauth: { name: "Stub", subscription: false } },
				});
				expect(detail.auth.credential).toBeUndefined();
				// Every header value stays on the server, on the provider and on a model.
				expect(detail.models).toMatchObject([
					{
						headers: { "X-Model": "" },
						id: "stub-model",
						reasoning: true,
						thinkingLevelMap: { high: "high", off: null },
					},
				]);
				expect(detail.modelOverrides).toMatchObject({ "stub-model": { maxTokens: 100 } });
				// pi's composed model is what the override dialog seeds from.
				const composed = detail.catalog.find((model) => model.id === "stub-model");
				expect(composed?.provider).toBe("stub");
				expect(composed?.contextWindow).toBeGreaterThan(0);
				expect(JSON.stringify(detail)).not.toContain("header-secret");
				expect(JSON.stringify(detail)).not.toContain("model-secret");
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
		"merges the provider's own blocks and keeps the compat keys it does not name",
		() => {
			const { agentDir, file, layer } = providerLayer("merge");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			writeFileSync(
				file,
				`${JSON.stringify(
					{
						providers: {
							stub: {
								api: "openai-completions",
								baseUrl: "http://127.0.0.1:1",
								compat: { customKey: true, thinkingFormat: "openai" },
								headers: { "X-Key": "stored" },
								modelOverrides: { "stub-model": { cost: { input: 1, output: 2 }, maxTokens: 100 } },
								models: [{ id: "stub-model" }],
								name: "Stub",
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
					// Empty clears the stored endpoint and family, which pi then inherits.
					api: "",
					authHeader: false,
					baseUrl: "",
					compat: { supportsReasoningEffort: true },
					headers: { "X-Key": "" },
					id: "stub",
					modelOverrides: { "stub-model": { contextWindow: 2000, cost: { input: 3 } } },
					name: "Stub",
					oauth: "radius",
				});
				const stored = readFile(file).providers["stub"];
				expect(stored).toMatchObject({
					authHeader: false,
					// A key this version does not name survives; the one it names and was not
					// sent is cleared.
					compat: { customKey: true, supportsReasoningEffort: true },
					// A blank header value keeps the stored one.
					headers: { "X-Key": "stored" },
					oauth: "radius",
				});
				expect(stored?.["api"]).toBeUndefined();
				expect(stored?.["baseUrl"]).toBeUndefined();
				// The payload did not name the models, so a built-in's catalog stays in place.
				expect(stored?.["models"]).toEqual([{ id: "stub-model" }]);
				// An override is a patch: the touched fields merge over the stored ones.
				expect(stored?.["modelOverrides"]).toEqual({
					"stub-model": { contextWindow: 2000, cost: { input: 3, output: 2 }, maxTokens: 100 },
				});

				yield* client["settings.providers.save"]({
					api: "",
					authHeader: "",
					baseUrl: "",
					compat: {},
					headers: {},
					id: "stub",
					modelOverrides: {},
					name: "Stub",
					oauth: "",
				});
				const cleared = readFile(file).providers["stub"];
				expect(cleared?.["authHeader"]).toBeUndefined();
				expect(cleared?.["headers"]).toBeUndefined();
				expect(cleared?.["modelOverrides"]).toBeUndefined();
				expect(cleared?.["oauth"]).toBeUndefined();
				// The block keeps only what the page never showed.
				expect(cleared?.["compat"]).toEqual({ customKey: true });
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
		"imports a gateway's model list, once per id, with the draft's key",
		() => {
			const { agentDir, file, layer } = providerLayer("import");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			const requests: Array<{ readonly headers: Headers; readonly path: string }> = [];
			return Effect.gen(function* () {
				const server = yield* Effect.acquireRelease(
					Effect.sync(() =>
						Bun.serve({
							fetch(request) {
								const url = new URL(request.url);
								requests.push({ headers: request.headers, path: url.pathname });
								if (url.pathname !== "/v1/models") {
									return new Response("not found", { status: 404 });
								}
								return Response.json({
									data: [
										{ id: "alpha" },
										{ id: "alpha" },
										{ id: "beta", name: "Beta", supported_endpoints: ["/messages"] },
									],
								});
							},
							port: 0,
						}),
					),
					(open) =>
						Effect.sync(() => {
							void open.stop(true);
						}),
				);
				const baseUrl = `${server.url.origin}/v1`;
				// The entry's `authHeader` decides whether the typed key travels as a bearer.
				writeFileSync(
					file,
					`${JSON.stringify(
						{
							providers: {
								gw: {
									api: "openai-completions",
									authHeader: true,
									baseUrl,
									models: [{ id: "alpha" }],
								},
							},
						},
						null,
						2,
					)}\n`,
				);
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const imported = yield* client["settings.providers.import"]({
					api: "openai-completions",
					apiKey: "typed-key",
					baseUrl,
					providerId: "gw",
				});
				expect(requests[0]?.headers.get("authorization")).toBe("Bearer typed-key");
				// The list is read once per id, in its own order.
				expect(imported.models.map((model) => model.id)).toEqual(["alpha", "beta"]);
				// A model the gateway serves only through Anthropic Messages gets that family
				// and the base above its `/v1`.
				expect(imported.models[1]).toMatchObject({
					api: "anthropic-messages",
					baseUrl: server.url.origin,
					name: "Beta",
				});
				// Google's list is a different shape, so the panel asks for those by hand.
				const declined = yield* Effect.flip(
					client["settings.providers.import"]({
						api: "google-generative-ai",
						baseUrl,
					}),
				);
				expect(declined).toBeInstanceOf(ProviderRefused);
				expect(declined.reason).toContain("no shared model list");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"tests the unsaved draft with its key and again without one",
		() => {
			const { agentDir, layer } = providerLayer("test");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			const seen: Array<{
				readonly path: string;
				readonly authorization: string | null;
				readonly draft: string | null;
				readonly model: unknown;
			}> = [];
			return Effect.gen(function* () {
				const server = yield* Effect.acquireRelease(
					Effect.sync(() =>
						Bun.serve({
							async fetch(request) {
								const body = Schema.decodeUnknownOption(RequestBody)(await request.json());
								seen.push({
									authorization: request.headers.get("authorization"),
									draft: request.headers.get("x-draft"),
									model: Option.isSome(body) ? body.value.model : undefined,
									path: new URL(request.url).pathname,
								});
								return new Response(openaiStream(), {
									headers: { "content-type": "text/event-stream" },
								});
							},
							port: 0,
						}),
					),
					(open) =>
						Effect.sync(() => {
							void open.stop(true);
						}),
				);
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const result = yield* client["settings.providers.test"]({
					api: "openai-completions",
					apiKey: "typed-key",
					baseUrl: `${server.url.origin}/v1`,
					headers: { "X-Draft": "yes" },
					model: { id: "m" },
					providerId: "draft",
				});
				expect(result.message).toContain("Reached draft/m with the typed key");
				expect(result.message).toContain("also answers without a key");
				expect(seen).toHaveLength(2);
				const keyed = seen.find((request) => request.authorization === "Bearer typed-key");
				const keyless = seen.find((request) => request.authorization === null);
				expect(keyed?.path).toBe("/v1/chat/completions");
				expect(keyed?.draft).toBe("yes");
				expect(keyed?.model).toBe("m");
				expect(keyless?.path).toBe("/v1/chat/completions");
				expect(keyless?.draft).toBe("yes");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"tests a level, reporting the reasoning field and tokens it sent",
		() => {
			const { agentDir, layer } = providerLayer("test-level");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			let effort: unknown;
			return Effect.gen(function* () {
				const server = yield* Effect.acquireRelease(
					Effect.sync(() =>
						Bun.serve({
							async fetch(request) {
								const body = Schema.decodeUnknownOption(RequestBody)(await request.json());
								effort = Option.isSome(body) ? body.value.reasoning_effort : undefined;
								return new Response(reasoningStream(), {
									headers: { "content-type": "text/event-stream" },
								});
							},
							port: 0,
						}),
					),
					(open) =>
						Effect.sync(() => {
							void open.stop(true);
						}),
				);
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const result = yield* client["settings.providers.test"]({
					api: "openai-completions",
					apiKey: "typed-key",
					baseUrl: `${server.url.origin}/v1`,
					level: "high",
					model: { id: "m", reasoning: true },
					providerId: "draft",
				});
				expect(result.message).toContain("at high");
				expect(result.message).toContain("7 reasoning tokens");
				expect(effort).toBe("high");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"refuses a key with a space, and a key that the provider rejects",
		() => {
			const { agentDir, layer } = providerLayer("test-key");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const server = yield* Effect.acquireRelease(
					Effect.sync(() =>
						Bun.serve({
							fetch(request) {
								if (request.headers.get("authorization") === null) {
									return new Response(openaiStream(), {
										headers: { "content-type": "text/event-stream" },
									});
								}
								return new Response(JSON.stringify({ error: { message: "bad key" } }), {
									headers: { "content-type": "application/json" },
									status: 401,
								});
							},
							port: 0,
						}),
					),
					(open) =>
						Effect.sync(() => {
							void open.stop(true);
						}),
				);
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const spaced = yield* Effect.flip(
					client["settings.providers.test"]({
						api: "openai-completions",
						apiKey: "secret key",
						baseUrl: `${server.url.origin}/v1`,
						model: { id: "m" },
						providerId: "draft",
					}),
				);
				expect(spaced).toBeInstanceOf(ProviderRefused);
				expect(spaced.reason).toContain("cannot contain spaces");
				// A key that fails is an error even though the endpoint answers keyless.
				const rejected = yield* Effect.flip(
					client["settings.providers.test"]({
						api: "openai-completions",
						apiKey: "wrong",
						baseUrl: `${server.url.origin}/v1`,
						model: { id: "m" },
						providerId: "draft",
					}),
				);
				expect(rejected.reason).toContain("failed with the typed key");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"names pi's own sign-in for a built-in, and refuses to sign out without one",
		() => {
			const { agentDir, layer } = providerLayer("logout");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(ProviderRpcs, ProvidersHandlersLive);
				const detail = yield* client["settings.providers.read"]({ id: "anthropic" });
				expect(detail.auth.oauth?.name).not.toBe("");
				expect(detail.auth.apiKey?.name).not.toBe("");
				const refused = yield* Effect.flip(
					client["settings.providers.logout"]({ id: "anthropic" }),
				);
				expect(refused).toBeInstanceOf(ProviderRefused);
				expect(refused.reason).toContain("no stored credential");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
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
				const dir = join(testPaths.scratch, "providers-f8l");
				const file = join(dir, "models.json");
				// A models.json entry is what puts a provider on the page; the cache decides `builtin`.
				mkdirSync(dir, { recursive: true });
				writeFileSync(
					file,
					`${JSON.stringify({
						providers: {
							anthropic: {
								baseUrl: "http://127.0.0.1:1",
								models: [{ id: "anthropic-test" }],
							},
						},
					})}\n`,
				);
				const runtime = yield* Effect.tryPromise(() =>
					ModelRuntime.create({ modelsPath: file, refreshOnCreate: false }),
				);
				const ids = new Set(runtime.getProviders().map((row) => row.id));
				const attempts = yield* Ref.make(0);
				const store = makeProvidersStore({ document, path: file });
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
