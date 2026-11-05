/**
 * The override payload. pi merges an override field by field, so a field the
 * operator did not touch must not appear: a written `reasoning: false` turns
 * thinking off on a model pi ships with reasoning on.
 */
import { expect, test } from "bun:test";

import type { ProviderModelInput } from "#protocol/settings/providers";

import { completeModelOf, formOf, overrideOf, touchedBy, valueOf } from "./provider-model-form";

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

/** pi's `gpt-5` with every documented model field filled in. */
const full: ProviderModelInput = {
	...shipped,
	inputLimits: {
		maxRequestBytes: 1000,
		images: {
			resize: { maxWidth: 800, maxHeight: 600, maxBytes: 100_000, jpegQuality: 80 },
			maxPerMessage: 4,
			maxPerRequest: 8,
		},
	},
	promptCache: { short: 300, long: 3600 },
	samplingParams: { temperature: 0.2, top_p: 0.9 },
	samplingParamsByThinkingLevel: { high: { reasoning_effort: "high" } },
	// The server sends a stored header with a blank value; a typed draft value has
	// to survive the same way.
	headers: { "x-gateway": "one" },
	cost: {
		input: 1.25,
		output: 10,
		cacheRead: 0.125,
		cacheWrite: 0,
		tiers: [
			{
				inputTokensAbove: 200_000,
				input: 2,
				output: 20,
				cacheRead: 0.2,
				cacheWrite: 0,
			},
		],
	},
};

test("every advanced field round-trips through the form", () => {
	const saved = valueOf(formOf(full), undefined);
	expect(saved.inputLimits).toEqual(full.inputLimits);
	expect(saved.promptCache).toEqual(full.promptCache);
	expect(saved.samplingParams).toEqual(full.samplingParams);
	expect(saved.samplingParamsByThinkingLevel).toEqual(full.samplingParamsByThinkingLevel);
	expect(saved.cost).toEqual(full.cost);
	expect(saved.headers).toEqual(full.headers);
});

test("an override writes an advanced field only when it was touched", () => {
	const form = formOf(shipped);
	const saved = overrideOf(
		valueOf({ ...form, promptCacheLong: "600" }, shipped.api),
		touchedBy(new Set(), { promptCacheLong: "600" }),
	);
	expect(saved).toEqual({ promptCache: { long: 600 } });
});

test("removing every header row clears the override's headers", () => {
	const form = formOf(shipped, { headers: { "x-old": "" } });
	const saved = overrideOf(
		valueOf({ ...form, headerRows: [] }, shipped.api),
		touchedBy(new Set(), { headerRows: [] }),
	);
	expect(saved.headers).toEqual({});
});

test("an override can name one cost rate", () => {
	const form = formOf(shipped);
	const saved = overrideOf(
		valueOf(
			{ ...form, costInput: "1", costOutput: "", costCacheRead: "", costCacheWrite: "" },
			shipped.api,
		),
		touchedBy(new Set(), { costInput: "1" }),
	);
	expect(saved.cost).toEqual({ input: 1 });
});

/**
 * A model a provider defines itself often has no rates: pi prices a model without a
 * `cost` as free, and `models.json` omits the block. The dialog allows leaving all four
 * empty, so the payload has to allow it too — it used to throw, which closed nothing and
 * left the model dialog open with no error on screen.
 */
test("a model with no cost rates saves without a cost block", () => {
	const form = formOf(undefined, undefined);
	const saved = completeModelOf(valueOf({ ...form, id: "stub-model" }, undefined));

	expect(saved.id).toBe("stub-model");
	expect(saved.cost).toBeUndefined();
});

test("a model with all four rates saves them as pi reads them", () => {
	const form = formOf(undefined, undefined);
	const saved = completeModelOf(
		valueOf(
			{
				...form,
				costCacheRead: "0.1",
				costCacheWrite: "0",
				costInput: "1",
				costOutput: "2",
				id: "stub-model",
			},
			undefined,
		),
	);

	expect(saved.cost).toEqual({ cacheRead: 0.1, cacheWrite: 0, input: 1, output: 2 });
});
