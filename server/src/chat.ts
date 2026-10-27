import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isStepCount,
	streamText,
	toUIMessageStream,
	validateUIMessages,
} from "ai";
import {
	CHAT_TOOLS,
	DEFAULT_CHAT_MODEL,
	getChatModel,
	type ChatModel,
	type ChatUIMessage,
} from "shared";
import { Hono } from "hono";
import { z } from "zod";

const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider/v1";
const MAX_OUTPUT_TOKENS = 8192;
const MAX_STEPS = 5;

// CommandCode exposes OpenAI Chat Completions and Anthropic Messages, so the
// model entry decides which provider package builds the language model.
function createLanguageModel(model: ChatModel, apiKey: string) {
	if (model.format === "messages") {
		return createAnthropic({ baseURL: COMMANDCODE_BASE_URL, apiKey })(model.id);
	}

	return createOpenAICompatible({
		name: "commandcode",
		baseURL: COMMANDCODE_BASE_URL,
		apiKey,
	})(model.id);
}

// validateUIMessages is the authority on each message and its parts, so the
// body only needs to prove that messages is an array.
const chatRequestBody = z.object({
	model: z.string().optional(),
	messages: z.array(z.unknown()),
});

export const chatRoutes = new Hono().post("/chat", async (c) => {
	// The chat endpoint is public: bound each request and add a rate limit
	// before exposing it to real traffic.
	const apiKey = process.env.COMMANDCODE_API_KEY;

	if (!apiKey) {
		return c.json({ error: "Set COMMANDCODE_API_KEY in server/.env." }, { status: 503 });
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body." }, { status: 400 });
	}

	const parsedBody = chatRequestBody.safeParse(body);
	if (!parsedBody.success) {
		return c.json({ error: "Invalid request body." }, { status: 400 });
	}

	const modelId = parsedBody.data.model ?? DEFAULT_CHAT_MODEL;
	const model = getChatModel(modelId);

	if (!model) {
		return c.json({ error: `Model ${modelId} is not available.` }, { status: 400 });
	}

	let messages: ChatUIMessage[];
	try {
		messages = await validateUIMessages<ChatUIMessage>({
			messages: parsedBody.data.messages,
			tools: CHAT_TOOLS,
		});
	} catch {
		return c.json({ error: "Invalid messages." }, { status: 400 });
	}

	const result = streamText({
		model: createLanguageModel(model, apiKey),
		messages: await convertToModelMessages(messages),
		tools: CHAT_TOOLS,
		stopWhen: isStepCount(MAX_STEPS),
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		abortSignal: c.req.raw.signal,
	});

	// A reply after ask_user continues the last message, so count its parts.
	const lastMessage = messages.at(-1);
	let reasoningCount =
		lastMessage?.role === "assistant"
			? lastMessage.parts.filter((part) => part.type === "reasoning").length
			: 0;
	const reasoningStarts = new Map<string, { index: number; time: number }>();

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({
			stream: result.stream,
			sendSources: true,
			// The AI SDK does not time reasoning, so time each block here.
			messageMetadata: ({ part }) => {
				if (part.type === "reasoning-start") {
					reasoningStarts.set(part.id, {
						index: reasoningCount++,
						time: Date.now(),
					});
				}

				const start = part.type === "reasoning-end" ? reasoningStarts.get(part.id) : undefined;

				if (!start) {
					return undefined;
				}

				return {
					reasoningDurations: { [start.index]: Date.now() - start.time },
				};
			},
			onError: () => "Something went wrong. Please try again.",
		}),
	});
});
