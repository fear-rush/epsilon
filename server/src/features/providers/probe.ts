/**
 * Try a provider draft before it is saved. The call goes through pi's own client
 * on a throwaway runtime (`registerProvider` is runtime-only, per ADR-0012).
 *
 * Two probes, because keyless endpoints exist: one with no auth header, and one
 * with the typed or saved key when there is a key. A provider that answers both
 * ways is reported as such; a key that fails is an error even when the endpoint
 * would answer without it.
 *
 * The first half of this file is the probe itself: the throwaway runtime, the
 * keyless and keyed calls and the stream capture. The second half builds the
 * target from a draft and the saved entry.
 */
import type { ThinkingLevel } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import type { ModelRuntime, ProviderModelConfig } from "../../platform/pi";
import { readProvidersFile } from "./store";
import type { ProviderTestInput } from "./contract";

const CONNECTION_PROMPT = "Reply with the single word: ok";
const REASONING_PROMPT =
	"A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with the number only.";
const TEST_MAX_TOKENS = 16;
const REASONING_MAX_TOKENS = 256;
const TEST_TIMEOUT_MS = 15_000;
const KEYLESS_PLACEHOLDER = "epsilon-no-key";

/** The header pi's client fills from an API key for a family. */
const authHeadersFor = (api: string): readonly string[] => {
	if (api === "anthropic-messages") return ["x-api-key", "authorization"];
	if (api === "google-generative-ai") return ["x-goog-api-key"];
	return ["authorization"];
};

type Probe = {
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

type Target = {
	home: AgentHome;
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

const probe = async (target: Target, key: string, keyless: boolean): Promise<Probe> => {
	const runtime = await modelRuntime(target.home);
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

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const clip = (text: string, limit = 60): string => {
	const flat = text.replace(/\s+/gu, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit - 3)}…` : flat;
};

/** Blank header values keep the stored one, the same rule the write follows. */
const draftHeaders = (input: ProviderTestInput): Record<string, string> =>
	Object.fromEntries(
		Object.entries(input.headers ?? {}).filter(([key, value]) => key !== "" && value !== ""),
	);

export const testProviderForHome = async (
	home: AgentHome,
	input: ProviderTestInput,
): Promise<{ message: string }> => {
	const typedKey = input.apiKey ?? "";
	const trimmedKey = typedKey.trim();
	if (typedKey !== trimmedKey || /[\r\n\t]/u.test(typedKey)) {
		throw new Error("The API key has spaces or line breaks. Paste only the key.");
	}
	// A literal key never contains whitespace; a `!command` reference may.
	if (/\s/u.test(trimmedKey) && !trimmedKey.startsWith("!")) {
		throw new Error("An API key cannot contain spaces. Paste only the key.");
	}

	const runtime = await modelRuntime(home);
	const providerId = input.providerId?.trim() || "epsilon-test";
	const requested = input.model;
	const runtimeModel =
		requested === undefined
			? runtime.getModels(providerId)[0]
			: runtime.getModel(providerId, requested.id);
	const modelId = requested?.id ?? runtimeModel?.id;
	if (modelId === undefined) {
		throw new Error("This provider has no model to test. Add a model first.");
	}

	const api = requested?.api ?? input.api ?? runtimeModel?.api;
	const baseUrl = requested?.baseUrl || input.baseUrl || runtimeModel?.baseUrl;
	if (api === undefined || baseUrl === undefined || baseUrl === "") {
		throw new Error("Choose an API family and a base URL before testing.");
	}

	const stored = await runtime.getAuth(providerId);
	const key = trimmedKey || stored?.auth.apiKey || "";
	const entry =
		input.providerId === undefined ? undefined : (await readProvidersFile(home))[input.providerId];

	const configModel: Extract<ProviderModelConfig, { reasoning: boolean }> = {
		type: "chat",
		id: modelId,
		name: requested?.name ?? runtimeModel?.name ?? modelId,
		api,
		reasoning: requested?.reasoning ?? runtimeModel?.reasoning ?? false,
		input: requested?.input ?? runtimeModel?.input ?? ["text"],
		cost: requested?.cost ?? runtimeModel?.cost ?? ZERO_COST,
		contextWindow: requested?.contextWindow ?? runtimeModel?.contextWindow ?? 128_000,
		maxTokens: requested?.maxTokens ?? runtimeModel?.maxTokens ?? 16_384,
	};
	if (requested?.baseUrl !== undefined) configModel.baseUrl = requested.baseUrl;
	const levelMap = requested?.thinkingLevelMap ?? runtimeModel?.thinkingLevelMap;
	if (levelMap !== undefined) configModel.thinkingLevelMap = levelMap;
	const compat = { ...input.compat, ...runtimeModel?.compat, ...requested?.compat };
	if (Object.keys(compat).length > 0) {
		// SAFETY: compat is a family-specific view of the same loose model field; pi
		// validates the family when it composes the request.
		configModel.compat = compat as NonNullable<
			Extract<ProviderModelConfig, { reasoning: boolean }>["compat"]
		>;
	}

	const draft = draftHeaders(input);
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(stored?.auth.headers ?? {})) {
		if (value !== null) headers[name] = value;
	}
	Object.assign(headers, draft);

	const target: Target = {
		home,
		providerId,
		modelId,
		name: input.name?.trim() || runtimeModel?.name || providerId,
		api,
		baseUrl,
		configModel,
		authHeader: entry?.authHeader === true,
		level: input.level,
		headers,
		draftHeaders: draft,
	};

	// The keyless probe suppresses the auth headers pi derives from a key, so a
	// provider that wants no key sees exactly no key. The placeholder satisfies
	// pi's own "configured" check without reaching the wire.
	const [keyless, keyed] = await Promise.all([
		probe(target, KEYLESS_PLACEHOLDER, true),
		key === "" ? Promise.resolve(undefined) : probe(target, key, false),
	]);

	const evidence = (result: Probe): string => {
		const sent = result.sent === undefined ? "" : `; sent ${result.sent}`;
		if (result.reasoningTokens !== undefined && result.reasoningTokens > 0) {
			return ` ${result.reasoningTokens} reasoning tokens${sent}.`;
		}
		if (result.thinkingChars > 0) return ` ${result.thinkingChars} thinking characters${sent}.`;
		if (result.sent !== undefined) return ` Sent ${result.sent}.`;
		return "";
	};
	const reply = (result: Probe): string =>
		result.text === "" ? "It answered without text." : `It replied "${clip(result.text)}".`;
	const withoutKey = (result: Probe): string =>
		result.ok
			? "The provider also answers without a key."
			: `Without a key: ${clip(result.error, 200)}.`;
	const at = input.level === undefined ? "" : ` at ${input.level}`;

	if (keyed !== undefined) {
		const source = trimmedKey !== "" ? "the typed key" : "the saved credential";
		if (!keyed.ok) {
			throw new Error(
				`The model test failed with ${source}${at}: ${clip(keyed.error, 200)}. ${withoutKey(keyless)}`,
			);
		}
		// A keyless 401 is diagnostic only: quoting it next to a pass reads as a failure.
		const keylessNote = keyless.ok ? ` ${withoutKey(keyless)}` : "";
		return {
			message: `Reached ${providerId}/${modelId} with ${source}${at}. ${reply(keyed)}${evidence(keyed)}${keylessNote} (${keyed.ms} ms)`,
		};
	}

	if (!keyless.ok) throw new Error(`Without an API key${at}: ${clip(keyless.error, 200)}.`);
	return {
		message: `Reached ${providerId}/${modelId} without an API key${at}. ${reply(keyless)}${evidence(keyless)} (${keyless.ms} ms)`,
	};
};
