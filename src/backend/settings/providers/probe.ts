import { Clock, Effect, Option, Schema } from "effect";

import { isProviderApi, type ProviderApi } from "#domain/providers/rules";
import { ThinkingLevel } from "#protocol/conversation/session";
import { ProviderRefused } from "#protocol/errors";
import { ReasoningCompat } from "#protocol/settings/providers";
import type {
	ModelInputLimits,
	ModelPromptCache,
	ProviderTestInput,
	ThinkingFormat,
	ThinkingLevelMap,
	ThinkingTokenBudgetField,
} from "#protocol/settings/providers";

import type { ModelRuntime, ProviderModelConfig } from "../../platform/pi.ts";

/**
 * Try a provider draft before it is saved. The call goes through pi's own client on a
 * throwaway runtime (`registerProvider` is runtime-only), so the request is the one pi
 * would make once the entry is written.
 *
 * Two probes, because keyless endpoints exist: one with no auth header, and one with the
 * typed or saved key when there is a key. A provider that answers both ways is reported as
 * such; a key that fails is an error even when the endpoint would answer without it.
 *
 * The first half of this file is the probe itself: the throwaway runtime, the keyless and
 * keyed calls and the stream capture. The second half builds the target from a draft and
 * the saved entry.
 */

const CONNECTION_PROMPT = "Reply with the single word: ok";
const REASONING_PROMPT =
	"A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with the number only.";
const TEST_MAX_TOKENS = 16;
const REASONING_MAX_TOKENS = 256;
const TEST_TIMEOUT_MS = 15_000;
const KEYLESS_PLACEHOLDER = "epsilon-no-key";

/** The header pi's client fills from an API key for a family. */
const authHeadersFor = (api: string): ReadonlyArray<string> => {
	if (api === "anthropic-messages") return ["x-api-key", "authorization"];
	if (api === "google-generative-ai") return ["x-goog-api-key"];
	return ["authorization"];
};

/** What one probe found. A failed call is a result, not a refusal: the page shows it. */
type Probe = {
	readonly ok: boolean;
	readonly text: string;
	readonly error: string;
	readonly ms: number;
	readonly reasoningTokens?: number | undefined;
	readonly thinkingChars: number;
	/** The reasoning field the request actually carried. */
	readonly sent?: string | undefined;
};

/** The fields of a provider stream the probe reads. Every one of them is optional. */
const StreamChunk = Schema.Struct({
	usage: Schema.optional(
		Schema.Struct({
			completion_tokens_details: Schema.optional(
				Schema.Struct({ reasoning_tokens: Schema.optional(Schema.Finite) }),
			),
			reasoning_tokens: Schema.optional(Schema.Finite),
		}),
	),
	choices: Schema.optional(
		Schema.Array(
			Schema.Struct({
				delta: Schema.optional(
					Schema.Struct({
						reasoning_content: Schema.optional(Schema.String),
						reasoning: Schema.optional(Schema.String),
					}),
				),
			}),
		),
	),
	delta: Schema.optional(Schema.Struct({ thinking: Schema.optional(Schema.String) })),
});

/** The request fields that name how a level travels, as one provider sends them. */
const Payload = Schema.Struct({
	reasoning_effort: Schema.optional(Schema.String),
	output_config: Schema.optional(Schema.Struct({ effort: Schema.optional(Schema.String) })),
	thinking: Schema.optional(Schema.Struct({ type: Schema.optional(Schema.String) })),
});

const decodeChunk = Schema.decodeOption(Schema.fromJsonString(StreamChunk));

/** What a provider stream said: its reasoning tokens and how much thinking it streamed. */
const readStream = (text: string): { reasoningTokens?: number; thinkingChars: number } => {
	let reasoningTokens: number | undefined;
	let thinkingChars = 0;
	for (const line of text.split("\n")) {
		if (!line.startsWith("data: ")) continue;
		const raw = line.slice(6).trim();
		if (raw === "" || raw === "[DONE]") continue;
		const decoded = decodeChunk(raw);
		// A keepalive or a line that is not JSON is not an error.
		if (Option.isNone(decoded)) continue;
		const chunk = decoded.value;
		const tokens =
			chunk.usage?.completion_tokens_details?.reasoning_tokens ?? chunk.usage?.reasoning_tokens;
		if (tokens !== undefined) reasoningTokens = tokens;
		const thought =
			chunk.choices?.[0]?.delta?.reasoning_content ??
			chunk.choices?.[0]?.delta?.reasoning ??
			chunk.delta?.thinking;
		if (thought !== undefined) thinkingChars += thought.length;
	}
	return reasoningTokens === undefined ? { thinkingChars } : { reasoningTokens, thinkingChars };
};

/** The sentence a failed call reports. pi rejects with an Error, or a string. */
const messageOf = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

type Target = {
	readonly providerId: string;
	readonly modelId: string;
	readonly name: string;
	readonly api: NonNullable<ProviderModelConfig["api"]>;
	readonly baseUrl: string;
	readonly configModel: ProviderModelConfig;
	readonly authHeader: boolean;
	readonly level?: ProviderTestInput["level"];
	/** Stored credential headers and the draft's headers, for the keyed probe. */
	readonly headers: Readonly<Record<string, string | null>>;
	/** The draft's headers only, so a keyless probe does not leak a stored token. */
	readonly draftHeaders: Record<string, string>;
};

/**
 * One call through pi's client on its own runtime. The response is cloned on its way to
 * pi so the probe can read the stream's usage and thinking without consuming it.
 */
const probe = (
	runtime: ModelRuntime,
	target: Target,
	key: string,
	keyless: boolean,
): Effect.Effect<Probe, ProviderRefused> =>
	Effect.gen(function* () {
		const subject = target.providerId;
		const config: Parameters<ModelRuntime["registerProvider"]>[1] = {
			api: target.api,
			baseUrl: target.baseUrl,
			apiKey: key,
			models: [target.configModel],
			name: target.name,
		};
		if (target.authHeader) config.authHeader = true;
		yield* Effect.try({
			try: () => runtime.registerProvider(target.providerId, config),
			catch: (cause) =>
				new ProviderRefused({
					providerId: subject,
					reason: `The draft did not compose: ${messageOf(cause)}`,
				}),
		});

		const model = runtime.getModel(target.providerId, target.modelId);
		if (model === undefined) {
			return yield* new ProviderRefused({
				providerId: subject,
				reason: "The test model did not compose.",
			});
		}

		const headers: Record<string, string | null> = keyless
			? {
					...target.draftHeaders,
					...Object.fromEntries(
						// A configured auth header also carries the placeholder, so suppress it too.
						[...authHeadersFor(target.api), ...(target.authHeader ? ["authorization"] : [])].map(
							(name) => [name, null],
						),
					),
				}
			: target.headers;

		// The provider stream carries the reasoning usage. Read the clone after pi has
		// consumed the original; the test reports tokens rather than a guess.
		let reading: Promise<string> | undefined;
		let sent: string | undefined;
		const capture = async (
			input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		): Promise<Response> => {
			const response = await fetch(input, init);
			reading = response.clone().text();
			return response;
		};
		// pi asks for `typeof fetch`, which in Bun carries `preconnect`; the capture never
		// preconnects, and the global function is the only implementation of it here.
		const fetchForPi = Object.assign(capture, { preconnect: globalThis.fetch.preconnect });

		const started = yield* Clock.currentTimeMillis;
		const options: NonNullable<Parameters<ModelRuntime["completeSimple"]>[2]> = {
			headers,
			maxRetries: 0,
			maxTokens: target.level === undefined ? TEST_MAX_TOKENS : REASONING_MAX_TOKENS,
			onPayload: (payload) => {
				const decoded = Schema.decodeUnknownOption(Payload)(payload);
				if (Option.isNone(decoded)) return undefined;
				const body = decoded.value;
				if (body.reasoning_effort !== undefined) {
					sent = `reasoning_effort: ${body.reasoning_effort}`;
				} else if (body.output_config?.effort !== undefined) {
					sent = `output_config.effort: ${body.output_config.effort}`;
				} else if (body.thinking?.type !== undefined) {
					sent = `thinking: ${body.thinking.type}`;
				}
				return undefined;
			},
			signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
			timeoutMs: TEST_TIMEOUT_MS,
			fetch: fetchForPi,
		};
		if (target.level !== undefined && target.level !== "off") options.reasoning = target.level;

		const answered = yield* Effect.tryPromise({
			catch: messageOf,
			try: () =>
				runtime.completeSimple(
					model,
					{
						messages: [
							{
								content: target.level === undefined ? CONNECTION_PROMPT : REASONING_PROMPT,
								role: "user",
								timestamp: started,
							},
						],
					},
					options,
				),
		}).pipe(
			Effect.match({
				onFailure: (reason) => ({ reason, result: undefined }),
				onSuccess: (result) => ({ reason: undefined, result }),
			}),
		);
		const finished = yield* Clock.currentTimeMillis;
		const pending = reading;
		const streamed =
			pending === undefined
				? { reasoningTokens: undefined, thinkingChars: 0 }
				: readStream(yield* Effect.promise(() => pending));
		const evidence = {
			reasoningTokens: streamed.reasoningTokens,
			sent,
			thinkingChars: streamed.thinkingChars,
		};
		const failed = (reason: string): Probe => ({
			error: reason,
			...evidence,
			ms: finished - started,
			ok: false,
			text: "",
		});
		if (answered.result === undefined) return failed(answered.reason);
		const answer = answered.result;
		if (answer.stopReason === "error" || answer.stopReason === "aborted") {
			const reason = answer.errorMessage;
			return failed(
				reason === undefined || reason === "" ? "The provider refused the request." : reason,
			);
		}
		return {
			error: "",
			...evidence,
			ms: finished - started,
			ok: true,
			text: answer.content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join(" ")
				.trim(),
		};
	});

/** One model pi composed, without importing pi's own type into this feature. */
type CatalogModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

/**
 * A test model can name a partial cost (an override may). pi's model config needs all
 * four rates, so the rates it leaves out come from the runtime model.
 */
const completeCost = (
	requested: ProviderTestInput["model"],
	catalog: CatalogModel | undefined,
): CatalogModel["cost"] => {
	const cost = requested?.cost;
	const complete: ModelConfigCost = {
		cacheRead: cost?.cacheRead ?? catalog?.cost.cacheRead ?? 0,
		cacheWrite: cost?.cacheWrite ?? catalog?.cost.cacheWrite ?? 0,
		input: cost?.input ?? catalog?.cost.input ?? 0,
		output: cost?.output ?? catalog?.cost.output ?? 0,
	};
	const tiers = cost?.tiers ?? catalog?.cost.tiers;
	if (tiers !== undefined) complete.tiers = [...tiers];
	return complete;
};

type ModelConfigCost = CatalogModel["cost"];

/** pi's chat model config, the one `registerProvider` composes a request from. */
type PiModel = Extract<ProviderModelConfig, { reasoning: boolean }>;

/** A field pi's model config can hold; an absent one is left out rather than `undefined`. */
const put = <Record extends object, Key extends keyof Record>(
	target: Record,
	key: Key,
	value: Record[Key] | undefined,
): void => {
	if (value !== undefined) target[key] = value;
};

/** pi's level map, built a level at a time so an unset level is absent, not undefined. */
const levelMapOf = (map: ThinkingLevelMap): NonNullable<PiModel["thinkingLevelMap"]> => {
	const next: NonNullable<PiModel["thinkingLevelMap"]> = {};
	for (const level of ThinkingLevel.literals) put(next, level, map[level]);
	return next;
};

/** The request limits pi's config takes, nested blocks included. */
const limitsOf = (limits: ModelInputLimits): NonNullable<PiModel["inputLimits"]> => {
	const next: NonNullable<PiModel["inputLimits"]> = {};
	put(next, "maxRequestBytes", limits.maxRequestBytes);
	const images = limits.images;
	if (images === undefined) return next;
	const imageLimits: NonNullable<NonNullable<PiModel["inputLimits"]>["images"]> = {};
	put(imageLimits, "maxPerMessage", images.maxPerMessage);
	put(imageLimits, "maxPerRequest", images.maxPerRequest);
	const resize = images.resize;
	if (resize !== undefined) {
		const sizes: NonNullable<NonNullable<NonNullable<PiModel["inputLimits"]>["images"]>["resize"]> =
			{};
		put(sizes, "maxWidth", resize.maxWidth);
		put(sizes, "maxHeight", resize.maxHeight);
		put(sizes, "maxBytes", resize.maxBytes);
		put(sizes, "jpegQuality", resize.jpegQuality);
		put(imageLimits, "resize", sizes);
	}
	put(next, "images", imageLimits);
	return next;
};

/** The cache lifetimes pi's config takes. */
const promptCacheOf = (cache: ModelPromptCache): NonNullable<PiModel["promptCache"]> => {
	const next: NonNullable<PiModel["promptCache"]> = {};
	put(next, "short", cache.short);
	put(next, "long", cache.long);
	return next;
};

/** The compat keys the Anthropic family understands. */
type AnthropicCompatFields = { forceAdaptiveThinking?: boolean };

/** The compat keys the OpenAI families understand: how a level travels in a request. */
type OpenAiCompatFields = {
	thinkingFormat?: ThinkingFormat;
	supportsReasoningEffort?: boolean;
	thinkingTokenBudgetField?: ThinkingTokenBudgetField;
	requiresReasoningContentOnAssistantMessages?: boolean;
};

/**
 * The compat keys one family understands, as pi's model config declares them. The same rule
 * the form applies before a save: Anthropic carries the adaptive switch, the OpenAI families
 * carry how the level travels, and Google carries nothing.
 */
const compatOf = (compat: ReasoningCompat, api: ProviderApi): NonNullable<PiModel["compat"]> => {
	if (api === "anthropic-messages") {
		const anthropic: AnthropicCompatFields = {};
		put(anthropic, "forceAdaptiveThinking", compat.forceAdaptiveThinking);
		return anthropic;
	}
	const openai: OpenAiCompatFields = {};
	put(openai, "thinkingFormat", compat.thinkingFormat);
	put(openai, "supportsReasoningEffort", compat.supportsReasoningEffort);
	put(openai, "thinkingTokenBudgetField", compat.thinkingTokenBudgetField);
	put(
		openai,
		"requiresReasoningContentOnAssistantMessages",
		compat.requiresReasoningContentOnAssistantMessages,
	);
	return openai;
};

const clip = (text: string, limit = 60): string => {
	const flat = text.replaceAll(/\s+/gu, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit - 3)}…` : flat;
};

/** What the call itself reported, when it carried a reasoning field or reasoned. */
const evidenceOf = (result: Probe): string => {
	const sentAt = result.sent === undefined ? "" : `; sent ${result.sent}`;
	if (result.reasoningTokens !== undefined && result.reasoningTokens > 0) {
		return ` ${result.reasoningTokens} reasoning tokens${sentAt}.`;
	}
	if (result.thinkingChars > 0) return ` ${result.thinkingChars} thinking characters${sentAt}.`;
	if (result.sent !== undefined) return ` Sent ${result.sent}.`;
	return "";
};

const replyOf = (result: Probe): string =>
	result.text === "" ? "It answered without text." : `It replied "${clip(result.text)}".`;

const withoutKeyOf = (result: Probe): string =>
	result.ok
		? "The provider also answers without a key."
		: `Without a key: ${clip(result.error, 200)}.`;

/** Blank header values keep the stored one, the same rule the write follows. */
const draftHeaders = (input: ProviderTestInput): Record<string, string> =>
	Object.fromEntries(
		Object.entries(input.headers ?? {}).filter(([key, value]) => key !== "" && value !== ""),
	);

/**
 * The composed model the probe registers: the draft's fields where the form has them, and
 * pi's own model where it does not, so the request is the one Save would produce.
 */
const configModelOf = (
	input: ProviderTestInput,
	runtimeModel: CatalogModel | undefined,
	modelId: string,
	api: Target["api"],
): ProviderModelConfig => {
	const requested = input.model;
	const model: Extract<ProviderModelConfig, { reasoning: boolean }> = {
		api,
		contextWindow: requested?.contextWindow ?? runtimeModel?.contextWindow ?? 128_000,
		cost: completeCost(requested, runtimeModel),
		id: modelId,
		input: [...(requested?.input ?? runtimeModel?.input ?? ["text"])],
		maxTokens: requested?.maxTokens ?? runtimeModel?.maxTokens ?? 16_384,
		name: requested?.name ?? runtimeModel?.name ?? modelId,
		reasoning: requested?.reasoning ?? runtimeModel?.reasoning ?? false,
		type: "chat",
	};
	if (requested?.baseUrl !== undefined) model.baseUrl = requested.baseUrl;
	const levelMap = requested?.thinkingLevelMap ?? runtimeModel?.thinkingLevelMap;
	if (levelMap !== undefined) model.thinkingLevelMap = levelMapOf(levelMap);
	if (requested?.inputLimits !== undefined) model.inputLimits = limitsOf(requested.inputLimits);
	if (requested?.promptCache !== undefined)
		model.promptCache = promptCacheOf(requested.promptCache);
	if (requested?.samplingParams !== undefined) model.samplingParams = requested.samplingParams;
	// The extension-facing model config has no per-level sampling params, so the probe
	// cannot apply them; the saved models.json still can.
	//
	// A blank header value means "the server already has it"; the throwaway runtime does
	// not, so sending the blank would suppress the header instead of keeping it.
	const typedHeaders = Object.fromEntries(
		Object.entries(requested?.headers ?? {}).filter(([, value]) => value !== ""),
	);
	if (Object.keys(typedHeaders).length > 0) model.headers = typedHeaders;
	// The provider's format, then pi's own for the model, then the model dialog's: a later
	// layer wins per key, as pi merges compat.
	const storedCompat = Schema.decodeUnknownOption(ReasoningCompat)(runtimeModel?.compat);
	const compat: ReasoningCompat = { ...input.compat };
	if (Option.isSome(storedCompat)) Object.assign(compat, storedCompat.value);
	if (requested?.compat !== undefined) Object.assign(compat, requested.compat);
	if (isProviderApi(api) && Object.keys(compat).length > 0) {
		model.compat = compatOf(compat, api);
	}
	return model;
};

export type TestOptions = {
	/** The `models.json` entry's `authHeader`, which the draft may override. */
	readonly authHeader: boolean;
	/** A fresh runtime per probe, so `registerProvider` cannot reach the page's catalog. */
	readonly runtime: Effect.Effect<ModelRuntime, { readonly reason: string }>;
};

export const testProvider = (
	input: ProviderTestInput,
	options: TestOptions,
): Effect.Effect<{ readonly message: string }, ProviderRefused> => {
	const trimmedId = input.providerId?.trim();
	const providerId = trimmedId === undefined || trimmedId === "" ? "epsilon-test" : trimmedId;
	const refusal = (reason: string): ProviderRefused => new ProviderRefused({ providerId, reason });
	return Effect.gen(function* () {
		const typedKey = input.apiKey ?? "";
		const trimmedKey = typedKey.trim();
		if (typedKey !== trimmedKey || /[\r\n\t]/u.test(typedKey)) {
			return yield* refusal("The API key has spaces or line breaks. Paste only the key.");
		}
		// A literal key never contains whitespace; a `!command` reference may.
		if (/\s/u.test(trimmedKey) && !trimmedKey.startsWith("!")) {
			return yield* refusal("An API key cannot contain spaces. Paste only the key.");
		}

		const runtime = yield* options.runtime.pipe(
			Effect.mapError((error) => refusal(`pi could not compose its catalog: ${error.reason}`)),
		);
		const requested = input.model;
		const runtimeModel =
			requested === undefined
				? runtime.getModels(providerId)[0]
				: runtime.getModel(providerId, requested.id);
		const modelId = requested?.id ?? runtimeModel?.id;
		if (modelId === undefined) {
			return yield* refusal("This provider has no model to test. Add a model first.");
		}
		const api = requested?.api ?? input.api ?? runtimeModel?.api;
		const candidate = requested?.baseUrl ?? input.baseUrl;
		const baseUrl = candidate === "" ? runtimeModel?.baseUrl : candidate;
		if (api === undefined || baseUrl === undefined || baseUrl === "") {
			return yield* refusal("Choose an API family and a base URL before testing.");
		}

		const stored = yield* Effect.tryPromise({
			catch: (cause) => refusal(`The stored credential could not be read (${messageOf(cause)}).`),
			try: () => runtime.getAuth(providerId),
		});
		const savedKey = stored?.auth.apiKey;
		const key = trimmedKey === "" ? (savedKey ?? "") : trimmedKey;
		const configModel = configModelOf(input, runtimeModel, modelId, api);
		const draft = draftHeaders(input);
		const headers: Record<string, string | null> = {};
		for (const [name, value] of Object.entries(stored?.auth.headers ?? {})) {
			if (value !== null) headers[name] = value;
		}
		Object.assign(headers, draft);
		const typedName = input.name?.trim();
		const target: Target = {
			api,
			authHeader: input.authHeader ?? options.authHeader,
			baseUrl,
			configModel,
			draftHeaders: draft,
			headers,
			level: input.level,
			modelId,
			name:
				typedName === undefined || typedName === ""
					? (runtimeModel?.name ?? providerId)
					: typedName,
			providerId,
		};

		// The keyless probe suppresses the auth headers pi derives from a key, so a provider
		// that wants no key sees exactly no key. The placeholder satisfies pi's own
		// "configured" check without reaching the wire.
		const keyless = yield* probe(runtime, target, KEYLESS_PLACEHOLDER, true);
		const keyed =
			key === ""
				? undefined
				: yield* options.runtime.pipe(
						Effect.mapError((error) =>
							refusal(`pi could not compose its catalog: ${error.reason}`),
						),
						Effect.flatMap((second) => probe(second, target, key, false)),
					);

		const at = input.level === undefined ? "" : ` at ${input.level}`;

		if (keyed !== undefined) {
			const source = trimmedKey === "" ? "the saved credential" : "the typed key";
			if (keyed.ok) {
				// A keyless 401 is diagnostic only: quoting it next to a pass reads as a failure.
				const keylessNote = keyless.ok ? ` ${withoutKeyOf(keyless)}` : "";
				return {
					message: `Reached ${providerId}/${modelId} with ${source}${at}. ${replyOf(keyed)}${evidenceOf(keyed)}${keylessNote} (${keyed.ms} ms)`,
				};
			}
			return yield* refusal(
				`The model test failed with ${source}${at}: ${clip(keyed.error, 200)}. ${withoutKeyOf(keyless)}`,
			);
		}
		if (keyless.ok) {
			return {
				message: `Reached ${providerId}/${modelId} without an API key${at}. ${replyOf(keyless)}${evidenceOf(keyless)} (${keyless.ms} ms)`,
			};
		}
		return yield* refusal(`Without an API key${at}: ${clip(keyless.error, 200)}.`);
	});
};
