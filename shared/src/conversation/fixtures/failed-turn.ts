/**
 * The two messages of a real refused turn: `hello` against an OpenRouter
 * credential with no credit. pi records the failure as an assistant message with
 * no content, `stopReason: "error"` and the provider's message; there is no
 * separate error event. Copied from the session file the failure produced.
 */
import type { ConversationMessage } from "../state";

export const failedTurn = [
	{
		role: "user",
		content: [{ type: "text", text: "hello" }],
		timestamp: 1793219231030,
	},
	{
		role: "assistant",
		content: [],
		api: "openai-completions",
		provider: "openrouter",
		model: "moonshotai/kimi-k2.6",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		timestamp: 1793219231225,
		errorMessage:
			'402: {"message":"This request requires more credits, or fewer max_tokens. You requested up to 230043 tokens, but can only afford 3698."}',
	},
] satisfies ConversationMessage[];
