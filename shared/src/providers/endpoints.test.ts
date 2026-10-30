import { describe, expect, test } from "bun:test";

import { providerBaseUrlProblem, providerEndpoint, providerModelsEndpoint } from "./endpoints";

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

describe("provider request endpoints", () => {
	test("appends the family path pi's client uses", () => {
		expect(providerEndpoint("anthropic-messages", "https://api.anthropic.com")).toBe(
			"https://api.anthropic.com/v1/messages",
		);
		expect(providerEndpoint("openai-completions", "https://api.commandcode.ai/provider/v1")).toBe(
			"https://api.commandcode.ai/provider/v1/chat/completions",
		);
	});
});

describe("base URL problems", () => {
	test("catches the anthropic base that already ends in the version", () => {
		expect(
			providerBaseUrlProblem("anthropic-messages", "https://api.commandcode.ai/provider/v1"),
		).toEqual({
			repeated: "/v1",
			suggestion: "https://api.commandcode.ai/provider",
		});
	});

	test("catches a pasted request or model-list endpoint", () => {
		expect(
			providerBaseUrlProblem("anthropic-messages", "https://api.anthropic.com/v1/messages"),
		).toEqual({ repeated: "/v1/messages", suggestion: "https://api.anthropic.com" });
		expect(
			providerBaseUrlProblem("openai-completions", "https://api.example.com/v1/models"),
		).toEqual({ repeated: "/models", suggestion: "https://api.example.com/v1" });
	});

	test("accepts an OpenAI base that carries the version", () => {
		expect(
			providerBaseUrlProblem("openai-completions", "https://api.commandcode.ai/provider/v1"),
		).toBeUndefined();
		expect(
			providerBaseUrlProblem("anthropic-messages", "https://api.anthropic.com"),
		).toBeUndefined();
	});
});
