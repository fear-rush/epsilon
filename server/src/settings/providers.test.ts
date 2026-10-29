/**
 * `models.json` is hand-editable, so a write must keep what this version does
 * not model. These checks read the file back from a temporary home.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeProvider } from "./provider-write";

const home = async (): Promise<string> => mkdtemp(join(tmpdir(), "epsilon-models-"));

const stored = async (root: string) =>
	JSON.parse(await readFile(join(root, "models.json"), "utf8"));

describe("provider writes", () => {
	test("keeps unknown keys on the entry, its models and its overrides", async () => {
		const root = await home();
		await writeFile(
			join(root, "models.json"),
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

	test("an omitted field is kept and an empty one clears it", async () => {
		const root = await home();
		await writeFile(
			join(root, "models.json"),
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
});
