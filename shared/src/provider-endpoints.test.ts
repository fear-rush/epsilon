import { describe, expect, test } from "bun:test";

import { providerModelsEndpoint } from "./provider-endpoints";

describe("provider model-list endpoints", () => {
	test("matches commandcode's documented paths", () => {
		const base = "https://api.commandcode.ai/provider/v1";
		expect(providerModelsEndpoint("openai-completions", base)).toBe(`${base}/models`);
	});

	test("Anthropic's client adds /v1/models to the base URL", () => {
		const base = "https://api.commandcode.ai/provider";
		expect(providerModelsEndpoint("anthropic-messages", base)).toBe(`${base}/v1/models`);
	});

	test("trailing slashes do not double up", () => {
		expect(providerModelsEndpoint("openai-responses", "https://example.com/v1/")).toBe(
			"https://example.com/v1/models",
		);
	});

	test("Google has no shared model list", () => {
		expect(
			providerModelsEndpoint("google-generative-ai", "https://example.com/v1beta"),
		).toBeUndefined();
	});
});
