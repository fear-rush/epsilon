/** The throwaway runtime, the keyless/keyed probes and the stream capture for a provider test. */
import type { ThinkingLevel } from "shared";
import { z } from "zod";

import type { ModelRuntime, ProviderModelConfig } from "../agent/sdk";

import { createRuntime } from "./providers";

const CONNECTION_PROMPT = "Reply with the single word: ok";
const REASONING_PROMPT =
	"A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with the number only.";
const TEST_MAX_TOKENS = 16;
const REASONING_MAX_TOKENS = 256;
const TEST_TIMEOUT_MS = 15_000;
export const KEYLESS_PLACEHOLDER = "epsilon-no-key";

/** The header pi's client fills from an API key for a family. */
const authHeadersFor = (api: string): readonly string[] => {
	if (api === "anthropic-messages") return ["x-api-key", "authorization"];
	if (api === "google-generative-ai") return ["x-goog-api-key"];
	return ["authorization"];
};

export type Probe = {
	ok: boolean;
	text: string;
	error: string;
	ms: number;
	reasoningTokens?: number;
	thinkingChars: number;
	/** The reasoning field the request actually carried. */
	sent?: string;
};

const payloadSchema = z.looseObject({
	reasoning_effort: z.string().optional(),
	output_config: z.looseObject({ effort: z.string().optional() }).optional(),
	thinking: z.looseObject({ type: z.string().optional() }).optional(),
});

type StreamChunk = {
	usage?: {
		completion_tokens_details?: { reasoning_tokens?: number };
		reasoning_tokens?: number;
	};
	choices?: { delta?: { reasoning_content?: string; reasoning?: string } }[];
	delta?: { thinking?: string };
};

export type Target = {
	home: string;
	providerId: string;
	modelId: string;
	name: string;
	api: NonNullable<ProviderModelConfig["api"]>;
	baseUrl: string;
	configModel: ProviderModelConfig;
	authHeader: boolean;
	level?: ThinkingLevel;
	/** Stored credential headers and the draft's headers, for the keyed probe. */
	headers: Record<string, string>;
	/** The draft's headers only, so a keyless probe does not leak a stored token. */
	draftHeaders: Record<string, string>;
};

export const probe = async (target: Target, key: string, keyless: boolean): Promise<Probe> => {
	const runtime = await createRuntime(target.home);
	const config: Parameters<ModelRuntime["registerProvider"]>[1] = {
		name: target.name,
		baseUrl: target.baseUrl,
		api: target.api,
		apiKey: key,
		models: [{ ...target.configModel }],
	};
	if (target.authHeader) config.authHeader = true;
	runtime.registerProvider(target.providerId, config);

	const model = runtime.getModel(target.providerId, target.modelId);
	if (model === undefined) throw new Error("The test model did not compose.");

	const headers = keyless
		? {
				...target.draftHeaders,
				...Object.fromEntries(authHeadersFor(target.api).map((name) => [name, null])),
			}
		: target.headers;

	// The provider stream carries the reasoning usage. Read a clone so pi still
	// consumes the original response; the test reports tokens, not a guess.
	let reasoningTokens: number | undefined;
	let streamedThinking = 0;
	let sent: string | undefined;
	let reading = Promise.resolve();
	type CaptureFetch = NonNullable<
		NonNullable<Parameters<ModelRuntime["completeSimple"]>[2]>["fetch"]
	>;
	const capture = async (
		input: Parameters<CaptureFetch>[0],
		init?: Parameters<CaptureFetch>[1],
	): Promise<Response> => {
		const response = await fetch(input, init);
		const copy = response.clone();
		reading = copy.text().then((text) => {
			for (const line of text.split("\n")) {
				if (!line.startsWith("data: ")) continue;
				const raw = line.slice(6).trim();
				if (raw === "" || raw === "[DONE]") continue;
				try {
					// SAFETY: provider streams are JSON; every field below is optional.
					const chunk = JSON.parse(raw) as StreamChunk;
					const tokens =
						chunk.usage?.completion_tokens_details?.reasoning_tokens ??
						chunk.usage?.reasoning_tokens;
					if (tokens !== undefined) reasoningTokens = tokens;
					const thought =
						chunk.choices?.[0]?.delta?.reasoning_content ??
						chunk.choices?.[0]?.delta?.reasoning ??
						chunk.delta?.thinking;
					if (thought !== undefined) streamedThinking += thought.length;
				} catch {
					// A keepalive or a non-JSON line is not an error.
				}
			}
		});
		return response;
	};

	const requestOptions: NonNullable<Parameters<ModelRuntime["completeSimple"]>[2]> = {
		maxTokens: target.level === undefined ? TEST_MAX_TOKENS : REASONING_MAX_TOKENS,
		headers,
		signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
		timeoutMs: TEST_TIMEOUT_MS,
		maxRetries: 0,
		// SAFETY: the request only reads the body; Bun's preconnect member is unused.
		fetch: capture as CaptureFetch,
		onPayload: (payload) => {
			const parsed = payloadSchema.safeParse(payload);
			if (!parsed.success) return undefined;
			const body = parsed.data;
			if (body.reasoning_effort !== undefined) {
				sent = `reasoning_effort: ${body.reasoning_effort}`;
			} else if (body.output_config?.effort !== undefined) {
				sent = `output_config.effort: ${body.output_config.effort}`;
			} else if (body.thinking?.type !== undefined) {
				sent = `thinking: ${body.thinking.type}`;
			}
			return undefined;
		},
	};
	if (target.level !== undefined && target.level !== "off") requestOptions.reasoning = target.level;

	const started = Date.now();
	try {
		const answer = await runtime.completeSimple(
			model,
			{
				messages: [
					{
						role: "user",
						content: target.level === undefined ? CONNECTION_PROMPT : REASONING_PROMPT,
						timestamp: Date.now(),
					},
				],
			},
			requestOptions,
		);
		await reading;
		const ms = Date.now() - started;
		const thinkingChars = Math.max(
			streamedThinking,
			answer.content
				.filter((part) => part.type === "thinking")
				.map((part) => part.thinking)
				.join("").length,
		);
		if (answer.stopReason === "error" || answer.stopReason === "aborted") {
			return {
				ok: false,
				text: "",
				error: answer.errorMessage || "The provider refused the request.",
				ms,
				reasoningTokens,
				thinkingChars,
				sent,
			};
		}
		return {
			ok: true,
			text: answer.content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join(" ")
				.trim(),
			error: "",
			ms,
			reasoningTokens,
			thinkingChars,
			sent,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			text: "",
			error: message,
			ms: Date.now() - started,
			reasoningTokens,
			thinkingChars: streamedThinking,
			sent,
		};
	}
};
