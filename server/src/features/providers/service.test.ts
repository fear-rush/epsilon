/**
 * `models.json` is hand-editable, so a write must keep what this version does
 * not model. These checks read the file back from a temporary home.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import type { ModelOverride, ProviderModelInput } from "./contract";
import { readProviderDetail, removeProvider, writeProvider } from "./service";

const home = async (): Promise<AgentHome> =>
	agentHome(await mkdtemp(join(tmpdir(), "epsilon-models-")));

const stored = async (root: AgentHome) => JSON.parse(await readFile(root.modelsFile, "utf8"));

describe("provider catalog", () => {
	test("a detail carries the fields an override seeds from", async () => {
		const root = await home();
		const runtime = await modelRuntime(root);
		const shipped = runtime.getModels("openai").find((model) => model.reasoning === true);
		if (shipped === undefined) throw new Error("pi ships no reasoning model for openai");

		const detail = await readProviderDetail(root, runtime, "openai");
		const seeded = detail?.catalog.find((model) => model.id === shipped.id);
		// The dialog starts from pi's values, so a field the operator does not edit
		// is shown as `true` here instead of as an empty `false`.
		expect(seeded).toMatchObject({
			provider: "openai",
			id: shipped.id,
			reasoning: true,
			thinkingLevelMap: shipped.thinkingLevelMap,
		});
	});

	test("a detail names the environment variable pi read", async () => {
		const previous = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "sk-test-not-a-key";
		try {
			const root = await home();
			const detail = await readProviderDetail(root, await modelRuntime(root), "anthropic");
			expect(detail?.source).toBe("environment");
			// The variable's name, never its value.
			expect(detail?.sourceLabel).toBe("ANTHROPIC_API_KEY");
		} finally {
			if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
			else process.env.ANTHROPIC_API_KEY = previous;
		}
	});

	test("an override that names one field leaves pi's reasoning on", async () => {
		const root = await home();
		const shipped = (await modelRuntime(root))
			.getModels("openai")
			.find((model) => model.reasoning === true);
		if (shipped === undefined) throw new Error("pi ships no reasoning model for openai");

		// What the dialog sends after the operator edits only the token limit.
		await writeProvider(root, {
			id: "openai",
			modelOverrides: { [shipped.id]: { maxTokens: 64_000 } },
		});

		const entry = (await stored(root)).providers.openai;
		expect(entry.modelOverrides[shipped.id]).toEqual({ maxTokens: 64_000 });
		const composed = (await modelRuntime(root))
			.getModels("openai")
			.find((model) => model.id === shipped.id);
		expect(composed?.reasoning).toBe(true);
		expect(composed?.maxTokens).toBe(64_000);
	});

	test("a partial override keeps the fields it did not name", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			JSON.stringify({
				providers: {
					openai: {
						modelOverrides: {
							"gpt-5": {
								name: "Chosen",
								reasoning: true,
								thinkingLevelMap: { high: "high" },
								// pi ignores these two in an override; Epsilon keeps the file's copy.
								api: "anthropic-messages",
								baseUrl: "https://legacy.test",
								maxTokens: 1000,
							},
						},
					},
				},
			}),
		);

		await writeProvider(root, { id: "openai", modelOverrides: { "gpt-5": { maxTokens: 2000 } } });

		expect((await stored(root)).providers.openai.modelOverrides["gpt-5"]).toEqual({
			name: "Chosen",
			reasoning: true,
			thinkingLevelMap: { high: "high" },
			api: "anthropic-messages",
			baseUrl: "https://legacy.test",
			maxTokens: 2000,
		});
	});
});

describe("provider writes", () => {
	test("reads a commented models.json and refuses to write over it", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			[
				"{",
				"  // a gateway the operator documented",
				'  "providers": {',
				'    "acme": {',
				'      "name": "Acme",',
				'      "baseUrl": "https://example.test/v1",',
				'      "api": "openai-completions",',
				'      "models": [{ "id": "m" },],',
				"    },",
				"  },",
				"}",
			].join("\n"),
		);

		// The `//` inside the base URL is a string, not a comment; pi reads it too.
		const detail = await readProviderDetail(root, await modelRuntime(root), "acme");
		expect(detail?.name).toBe("Acme");

		await expect(writeProvider(root, { id: "acme", name: "Renamed" })).rejects.toThrow(/line 2/);
		expect(await readFile(root.modelsFile, "utf8")).toContain("// a gateway");
	});

	test("every documented model field survives a round trip", async () => {
		const root = await home();
		const model: ProviderModelInput = {
			id: "acme-1",
			name: "Acme",
			api: "openai-completions",
			baseUrl: "https://example.test/v1",
			reasoning: true,
			thinkingLevelMap: { low: "low", high: "high", max: null },
			compat: { supportsReasoningEffort: true },
			input: ["text", "image"],
			inputLimits: {
				maxRequestBytes: 1000,
				images: {
					resize: { maxWidth: 800, maxHeight: 600, maxBytes: 100_000, jpegQuality: 80 },
					maxPerMessage: 4,
					maxPerRequest: 8,
				},
			},
			promptCache: { short: 300, long: 3600 },
			samplingParams: { temperature: 0.2, thinking: { type: "enabled" } },
			samplingParamsByThinkingLevel: { high: { reasoning_effort: "high" } },
			headers: { "x-gateway": "one" },
			contextWindow: 1000,
			maxTokens: 100,
			cost: {
				input: 1,
				output: 2,
				cacheRead: 0.1,
				cacheWrite: 0.2,
				tiers: [
					{
						inputTokensAbove: 200_000,
						input: 2,
						output: 4,
						cacheRead: 0.2,
						cacheWrite: 0.4,
					},
				],
			},
		};

		await writeProvider(root, {
			id: "acme",
			name: "Acme",
			baseUrl: "https://example.test/v1",
			api: "openai-completions",
			models: [model],
		});

		expect((await stored(root)).providers.acme.models[0]).toEqual(model);
		const detail = await readProviderDetail(root, await modelRuntime(root), "acme");
		const view = detail?.models[0];
		expect(view?.inputLimits).toEqual(model.inputLimits);
		expect(view?.promptCache).toEqual(model.promptCache);
		expect(view?.samplingParams).toEqual(model.samplingParams);
		expect(view?.samplingParamsByThinkingLevel).toEqual(model.samplingParamsByThinkingLevel);
		expect(view?.cost).toEqual(model.cost);
		// A stored header value never comes back to the browser; its key does.
		expect(view?.headers).toEqual({ "x-gateway": "" });
	});

	test("every documented override field survives a round trip", async () => {
		const root = await home();
		const override: ModelOverride = {
			name: "Chosen",
			reasoning: true,
			thinkingLevelMap: { high: "high" },
			compat: { thinkingFormat: "deepseek" },
			input: ["text"],
			inputLimits: { maxRequestBytes: 500 },
			promptCache: { short: 60 },
			samplingParams: { temperature: 0 },
			samplingParamsByThinkingLevel: { low: { reasoning_effort: "low" } },
			headers: { "x-override": "two" },
			contextWindow: 2000,
			maxTokens: 200,
			cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
		};

		await writeProvider(root, { id: "openai", modelOverrides: { "gpt-5": override } });
		expect((await stored(root)).providers.openai.modelOverrides["gpt-5"]).toEqual(override);

		const detail = await readProviderDetail(root, await modelRuntime(root), "openai");
		expect(detail?.modelOverrides["gpt-5"]?.headers).toEqual({ "x-override": "" });
	});

	test("a partial override cost survives a save and merges per field", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			JSON.stringify({
				providers: { openai: { modelOverrides: { "gpt-5": { cost: { input: 1 } } } } },
			}),
		);

		await writeProvider(root, { id: "openai", modelOverrides: { "gpt-5": { maxTokens: 1000 } } });
		const entry = () => stored(root).then((file) => file.providers.openai.modelOverrides["gpt-5"]);
		expect(await entry()).toEqual({ cost: { input: 1 }, maxTokens: 1000 });

		// A named rate merges over the stored partial entry; the unnamed ones stay out.
		await writeProvider(root, {
			id: "openai",
			modelOverrides: { "gpt-5": { cost: { output: 5 } } },
		});
		expect(await entry()).toEqual({ cost: { input: 1, output: 5 }, maxTokens: 1000 });

		const detail = await readProviderDetail(root, await modelRuntime(root), "openai");
		expect(detail?.modelOverrides["gpt-5"]?.cost).toEqual({ input: 1, output: 5 });
	});

	test("removing a provider entry leaves a stored credential alone", async () => {
		const root = await home();
		const runtime = await modelRuntime(root);
		await runtime.login("anthropic", "api_key", {
			prompt: async () => "sk-test-not-a-key",
			notify: () => undefined,
		});
		await writeProvider(root, { id: "anthropic", baseUrl: "https://example.test" });

		await removeProvider(root, "anthropic");

		expect((await stored(root)).providers.anthropic).toBeUndefined();
		// Deleting the override must not sign the account out.
		expect(await (await modelRuntime(root)).listCredentials()).toEqual([
			{ providerId: "anthropic", type: "api_key" },
		]);
	});

	test("a provider's auth header and radius OAuth survive a round trip", async () => {
		const root = await home();
		await writeProvider(root, {
			id: "acme",
			name: "Acme",
			baseUrl: "https://example.test/v1",
			api: "openai-completions",
			authHeader: true,
			oauth: "radius",
		});

		expect((await stored(root)).providers.acme).toMatchObject({
			authHeader: true,
			oauth: "radius",
		});
		const detail = await readProviderDetail(root, await modelRuntime(root), "acme");
		expect(detail?.stored).toMatchObject({ authHeader: true, oauth: "radius" });

		await writeProvider(root, { id: "acme", authHeader: "", oauth: "" });
		const cleared = (await stored(root)).providers.acme;
		expect(cleared.authHeader).toBeUndefined();
		expect(cleared.oauth).toBeUndefined();
		expect(cleared.name).toBe("Acme");
	});

	test("keeps unknown keys on the entry, its models and its overrides", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			JSON.stringify({
				providers: {
					gateway: {
						name: "Gateway",
						futureKey: { keep: true },
						apiKey: "secret",
						models: [{ id: "acme-1", futureModelKey: 7 }],
						modelOverrides: {
							"gpt-5": { contextWindow: 1000, futureOverrideKey: "keep" },
						},
					},
				},
			}),
		);

		await writeProvider(root, {
			id: "gateway",
			name: "Gateway 2",
			models: [{ id: "acme-1" }],
			modelOverrides: { "gpt-5": { maxTokens: 10 } },
		});

		const file = await stored(root);
		const entry = file.providers.gateway;
		expect(entry.name).toBe("Gateway 2");
		expect(entry.futureKey).toEqual({ keep: true });
		expect(entry.models[0].futureModelKey).toBe(7);
		expect(entry.modelOverrides["gpt-5"].futureOverrideKey).toBe("keep");
		expect(entry.modelOverrides["gpt-5"].maxTokens).toBe(10);
	});

	test("writes thinking level maps and reasoning compat", async () => {
		const root = await home();
		await writeProvider(root, {
			id: "gateway",
			baseUrl: "https://example.test/v1",
			api: "openai-completions",
			compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
			models: [
				{
					id: "m",
					thinkingLevelMap: { off: null, low: "low", high: "high", max: "max" },
					compat: { requiresReasoningContentOnAssistantMessages: true },
				},
			],
			modelOverrides: {
				"gpt-5": { thinkingLevelMap: { high: "high", max: "max" } },
			},
		});

		const entry = (await stored(root)).providers.gateway;
		expect(entry.compat).toEqual({ thinkingFormat: "deepseek", supportsReasoningEffort: true });
		expect(entry.models[0].thinkingLevelMap).toEqual({
			off: null,
			low: "low",
			high: "high",
			max: "max",
		});
		expect(entry.models[0].compat).toEqual({ requiresReasoningContentOnAssistantMessages: true });
		expect(entry.modelOverrides["gpt-5"].thinkingLevelMap).toEqual({
			high: "high",
			max: "max",
		});
	});

	test("an omitted field is kept and an empty one clears it", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			JSON.stringify({
				providers: { gateway: { name: "Gateway", baseUrl: "https://example.test" } },
			}),
		);

		await writeProvider(root, { id: "gateway", name: "Renamed" });
		expect((await stored(root)).providers.gateway.baseUrl).toBe("https://example.test");

		await writeProvider(root, { id: "gateway", baseUrl: "" });
		const entry = (await stored(root)).providers.gateway;
		expect(entry.baseUrl).toBeUndefined();
		expect(entry.name).toBe("Renamed");
	});

	test("two concurrent writes to different providers both survive", async () => {
		const root = await home();
		// Each write used to read models.json before it queued its write, so the
		// second one wrote back a file that did not hold the first.
		await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				writeProvider(root, { id: `gateway-${index}`, name: `Gateway ${index}` }),
			),
		);

		const providers = (await stored(root)).providers;
		expect(Object.keys(providers).toSorted()).toEqual(
			Array.from({ length: 8 }, (_, index) => `gateway-${index}`).toSorted(),
		);
		expect(providers["gateway-3"].name).toBe("Gateway 3");
	});

	test("a write and a removal racing on one file both apply", async () => {
		const root = await home();
		await writeProvider(root, { id: "old", name: "Old" });
		await Promise.all([
			writeProvider(root, { id: "new", name: "New" }),
			removeProvider(root, "old"),
		]);

		expect(Object.keys((await stored(root)).providers)).toEqual(["new"]);
	});

	test("refuses to write over a models.json it cannot parse", async () => {
		const root = await home();
		await writeFile(root.modelsFile, "{ not json");

		await expect(writeProvider(root, { id: "gateway", name: "Gateway" })).rejects.toThrow(
			"not valid for pi",
		);
		expect(await readFile(root.modelsFile, "utf8")).toBe("{ not json");
	});
});
