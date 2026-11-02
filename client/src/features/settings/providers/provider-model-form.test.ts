/**
 * The override payload. pi merges an override field by field, so a field the
 * operator did not touch must not appear: a written `reasoning: false` turns
 * thinking off on a model pi ships with reasoning on.
 */
import { expect, test } from "bun:test";

import type { ProviderModelInput } from "@/api/types";
import { formOf, overrideOf, touchedBy, valueOf } from "./provider-model-form";

/** pi 1.4.0's `openai/gpt-5`, as the provider detail now carries it. */
const shipped: ProviderModelInput = {
	id: "gpt-5",
	name: "GPT-5",
	api: "openai-responses",
	baseUrl: "https://api.openai.com/v1",
	reasoning: true,
	input: ["text", "image"],
	cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	contextWindow: 400000,
	maxTokens: 128000,
	thinkingLevelMap: {
		off: null,
		minimal: "minimal",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: null,
		max: null,
	},
};

test("editing only the token limit writes only the token limit", () => {
	const form = formOf(shipped);
	const touched = touchedBy(new Set(), { maxTokens: "64000" });
	const saved = overrideOf(valueOf({ ...form, maxTokens: "64000" }, shipped.api), touched);
	expect(saved).toEqual({ maxTokens: 64000 });
});

test("the dialog opens on pi's reasoning rather than an empty false", () => {
	const form = formOf(shipped);
	expect(form.reasoning).toBe(true);
	// Turning it off is deliberate, so that value is written.
	const saved = overrideOf(
		valueOf({ ...form, reasoning: false }, shipped.api),
		touchedBy(new Set(), { reasoning: false }),
	);
	expect(saved).toEqual({ reasoning: false });
});

test("a legacy override's api never reaches the test payload", () => {
	// pi ignores api and baseUrl in an override; the probe must try what pi uses.
	const form = formOf(shipped, {
		api: "anthropic-messages",
		baseUrl: "https://legacy.test",
		maxTokens: 64_000,
	});
	const payload = valueOf(form, undefined);
	expect(payload.api).toBe(shipped.api);
	expect(payload.baseUrl).toBe(shipped.baseUrl);
	expect(form.maxTokens).toBe("64000");
});
