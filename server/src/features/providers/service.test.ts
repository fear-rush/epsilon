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
import { removeProvider, writeProvider } from "./service";

const home = async (): Promise<AgentHome> =>
	agentHome(await mkdtemp(join(tmpdir(), "epsilon-models-")));

const stored = async (root: AgentHome) => JSON.parse(await readFile(root.modelsFile, "utf8"));

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
