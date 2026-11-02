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
