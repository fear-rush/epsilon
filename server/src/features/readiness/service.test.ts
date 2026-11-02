/**
 * Readiness is pi's answer, not a model count: a file pi cannot compose is
 * invalid and names its provider, while a stored key is a provider the engine can
 * reach. These run against a real agent home.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import type { ProviderEntry } from "../providers";
import { readReadiness } from "./service";

const home = async (providers?: Record<string, ProviderEntry>) => {
	const root = agentHome(await mkdtemp(join(tmpdir(), "epsilon-readiness-")));
	if (providers !== undefined) {
		await writeFile(root.modelsFile, JSON.stringify({ providers }));
	}
	return root;
};

describe("readiness", () => {
	test("a name-only entry is invalid and names the provider", async () => {
		const readiness = await readReadiness(await home({ acme: { name: "Acme" } }));
		if (readiness.ready) throw new Error("expected a refusal");
		expect(readiness.status).toBe("invalid");
		expect(readiness.provider).toBe("acme");
		expect(readiness.detail).toContain("acme");
	});

	test("a stored API key makes a provider ready", async () => {
		expect(await readReadiness(await home({ openai: { apiKey: "sk-test" } }))).toEqual({
			ready: true,
		});
	});
});
