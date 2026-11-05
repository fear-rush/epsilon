/**
 * What pi appends to a provider's base URL, where a compatible model list lives, and the
 * base URLs that would double up. The provider form explains a base with these rules and
 * the model import calls them, so a wrong path is the difference between an import and a
 * 404.
 */
import { describe, expect, test } from "bun:test";

import {
	providerApiInfo,
	providerApiInfos,
	providerBaseUrlProblem,
	providerModelsEndpoint,
} from "./rules.ts";

describe("provider model-list endpoints", () => {
	test("matches commandcode's documented paths", () => {
		const base = "https://api.commandcode.ai/provider/v1";
		expect(providerModelsEndpoint("openai-completions", base)).toBe(`${base}/models`);
	});

	test("Anthropic's client adds /v1/models to the base URL", () => {
		const base = "https://api.commandcode.ai/provider";
		expect(providerModelsEndpoint("anthropic-messages", base)).toBe(`${base}/v1/models`);
	});

	test("trailing slashes and spaces do not double up", () => {
		expect(providerModelsEndpoint("openai-responses", "https://example.com/v1/")).toBe(
			"https://example.com/v1/models",
		);
		expect(providerModelsEndpoint("openai-completions", " https://example.com/v1 ")).toBe(
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
	test("every family names the path pi's client appends", () => {
		expect(providerApiInfo("anthropic-messages")?.path).toBe("/v1/messages");
		expect(providerApiInfo("openai-completions")?.path).toBe("/chat/completions");
		expect(providerApiInfo("openai-responses")?.path).toBe("/responses");
		expect(providerApiInfo("google-generative-ai")?.path).toBe("/models/{model}:generateContent");
	});

	test("the picker lists every family once, in pi's order", () => {
		expect(providerApiInfos.map((info) => info.id)).toEqual([
			"openai-completions",
			"openai-responses",
			"anthropic-messages",
			"google-generative-ai",
		]);
		expect(providerApiInfos.every((info) => info.label !== "")).toBe(true);
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

	test("suggests nothing when the rest is only a scheme", () => {
		expect(providerBaseUrlProblem("anthropic-messages", "https://v1")).toBeUndefined();
		expect(providerBaseUrlProblem("anthropic-messages", "")).toBeUndefined();
	});
});
