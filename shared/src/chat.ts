import { type InferUITools, type UIDataTypes, type UIMessage, tool } from "ai";
import { z } from "zod";

// CommandCode serves Claude models only on /messages and everything else on
// /chat/completions, so each entry names the wire format to speak.
export interface ChatModel {
	id: string;
	name: string;
	format: "messages" | "chat-completions";
}

// Every model CommandCode lists at GET .../provider/v1/models, default first.
// Claude models are served only on /messages, the rest on /chat/completions.
export const CHAT_MODELS = [
	{
		id: "deepseek/deepseek-v4.1-flash",
		name: "DeepSeek V4.1 Flash (latest)",
		format: "chat-completions",
	},
	{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", format: "messages" },
	{ id: "claude-sonnet-5", name: "Claude Sonnet 5", format: "messages" },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", format: "messages" },
	{ id: "claude-fable-5-1", name: "Claude Fable 5.1", format: "messages" },
	{ id: "claude-fable-5", name: "Claude Fable 5", format: "messages" },
	{ id: "claude-opus-5-5", name: "Claude Opus 5.5", format: "messages" },
	{ id: "claude-opus-5", name: "Claude Opus 5", format: "messages" },
	{ id: "claude-opus-4-8", name: "Claude Opus 4.8", format: "messages" },
	{ id: "claude-opus-4-7", name: "Claude Opus 4.7", format: "messages" },
	{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", format: "messages" },
	{ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", format: "messages" },
	{ id: "gpt-6-astra", name: "GPT-6 Astra", format: "chat-completions" },
	{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol", format: "chat-completions" },
	{ id: "gpt-6.1-terra", name: "GPT-6.1 Terra", format: "chat-completions" },
	{ id: "gpt-6-sol", name: "GPT-6 Sol", format: "chat-completions" },
	{ id: "gpt-6-luna", name: "GPT-6 Luna", format: "chat-completions" },
	{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", format: "chat-completions" },
	{ id: "gpt-5.6-terra", name: "GPT-5.6 Terra", format: "chat-completions" },
	{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna", format: "chat-completions" },
	{ id: "gpt-5.5", name: "GPT-5.5", format: "chat-completions" },
	{ id: "gpt-5.4", name: "GPT-5.4", format: "chat-completions" },
	{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex", format: "chat-completions" },
	{ id: "gpt-5.4-mini", name: "GPT-5.4 Mini", format: "chat-completions" },
	{ id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro (latest)", format: "chat-completions" },
	{
		id: "deepseek/deepseek-v4-flash",
		name: "DeepSeek V4 Flash (latest)",
		format: "chat-completions",
	},
	{
		id: "deepseek/deepseek-v4-flash-vision-exp",
		name: "DeepSeek V4 Flash Vision (exp)",
		format: "chat-completions",
	},
	{
		id: "deepseek/deepseek-v4-flash-fast",
		name: "DeepSeek V4 Flash Fast",
		format: "chat-completions",
	},
	{
		id: "deepseek/deepseek-v4.1-flash-fast",
		name: "DeepSeek V4.1 Flash Fast (latest)",
		format: "chat-completions",
	},
	{ id: "moonshotai/Kimi-K3.1-Pro", name: "Kimi K3.1 Pro", format: "chat-completions" },
	{ id: "moonshotai/Kimi-K3", name: "Kimi K3", format: "chat-completions" },
	{ id: "moonshotai/Kimi-K2.7-Code", name: "Kimi K2.7 Code", format: "chat-completions" },
	{
		id: "moonshotai/Kimi-K2.7-Code-Highspeed",
		name: "Kimi K2.7 Code HighSpeed",
		format: "chat-completions",
	},
	{ id: "moonshotai/Kimi-K2.6", name: "Kimi K2.6", format: "chat-completions" },
	{ id: "moonshotai/Kimi-K2.5", name: "Kimi K2.5", format: "chat-completions" },
	{ id: "z-ai/glm-5.3-flash", name: "GLM-5.3 Flash", format: "chat-completions" },
	{ id: "z-ai/glm-5.3-flashx", name: "GLM-5.3 FlashX", format: "chat-completions" },
	{ id: "zai-org/GLM-5.3", name: "GLM-5.3", format: "chat-completions" },
	{ id: "zai-org/GLM-5.2", name: "GLM-5.2", format: "chat-completions" },
	{ id: "zai-org/GLM-5.2-Fast", name: "GLM-5.2 Fast", format: "chat-completions" },
	{ id: "zai-org/GLM-5.1", name: "GLM-5.1", format: "chat-completions" },
	{ id: "zai-org/GLM-5", name: "GLM-5", format: "chat-completions" },
	{ id: "minimax/minimax-m3.1-flash", name: "MiniMax M3.1 Flash", format: "chat-completions" },
	{ id: "MiniMaxAI/MiniMax-M3", name: "MiniMax M3", format: "chat-completions" },
	{ id: "MiniMaxAI/MiniMax-M2.7", name: "MiniMax M2.7", format: "chat-completions" },
	{ id: "MiniMaxAI/MiniMax-M2.5", name: "MiniMax M2.5", format: "chat-completions" },
	{ id: "ornith/ornith-1.5-122b", name: "Ornith 1.5 122B", format: "chat-completions" },
	{ id: "xiaomi/mimo-v2.6-pro", name: "MiMo V2.6 Pro", format: "chat-completions" },
	{
		id: "xiaomi/mimo-v2.6-pro-ultraspeed",
		name: "MiMo V2.6 Pro UltraSpeed",
		format: "chat-completions",
	},
	{ id: "xiaomi/mimo-v2.6-flash", name: "MiMo V2.6 Flash", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-Omni-Flash", name: "Qwen 3.8 Omni Flash", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-Max-Prime", name: "Qwen 3.8 Max Prime", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-Max-0902", name: "Qwen 3.8 Max 0902", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-Max", name: "Qwen 3.8 Max", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-27B", name: "Qwen 3.8 27B", format: "chat-completions" },
	{ id: "Qwen/Qwen3.8-Flash", name: "Qwen 3.8 Flash", format: "chat-completions" },
	{ id: "Qwen/Qwen3.7-Max", name: "Qwen 3.7 Max", format: "chat-completions" },
	{ id: "Qwen/Qwen3.7-Plus", name: "Qwen 3.7 Plus", format: "chat-completions" },
	{ id: "Qwen/Qwen3.7-Flash", name: "Qwen 3.7 Flash", format: "chat-completions" },
	{ id: "Qwen/Qwen3.6-Max-Preview", name: "Qwen 3.6 Max Preview", format: "chat-completions" },
	{ id: "Qwen/Qwen3.6-Plus", name: "Qwen 3.6 Plus", format: "chat-completions" },
	{ id: "meituan/LongCat-2.0", name: "LongCat 2.0", format: "chat-completions" },
	{ id: "stepfun/Step-5-Preview", name: "Step 5 Preview", format: "chat-completions" },
	{ id: "stepfun/Step-3.7-Flash", name: "Step 3.7 Flash", format: "chat-completions" },
	{ id: "stepfun/Step-3.5-Flash", name: "Step 3.5 Flash", format: "chat-completions" },
	{ id: "tencent/hy3-paid", name: "Tencent Hy3", format: "chat-completions" },
	{ id: "tencent/hy4-preview", name: "Tencent Hy4 Preview", format: "chat-completions" },
	{ id: "google/gemini-4-argon", name: "Gemini 4 Argon", format: "chat-completions" },
	{ id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", format: "chat-completions" },
	{ id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", format: "chat-completions" },
	{ id: "google/gemini-3.6-flash", name: "Gemini 3.6 Flash", format: "chat-completions" },
	{ id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", format: "chat-completions" },
	{ id: "google/gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", format: "chat-completions" },
	{ id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", format: "chat-completions" },
	{ id: "sakana/fugu-ultra", name: "Fugu Ultra", format: "chat-completions" },
	{ id: "nvidia/nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra", format: "chat-completions" },
	{ id: "nvidia/nemotron-3.5-super-vl", name: "Nemotron 3.5 Super VL", format: "chat-completions" },
	{ id: "thinkingmachines/inkling", name: "Inkling", format: "chat-completions" },
	{ id: "thinkingmachines/inkling-small", name: "Inkling Small", format: "chat-completions" },
	{ id: "stealth/glyph-cluster:free", name: "Glyph Cluster", format: "chat-completions" },
	{ id: "reflection/beam:free", name: "Beam 1.0", format: "chat-completions" },
	{ id: "poolside/laguna-s-2.1-free", name: "Laguna S 2.1", format: "chat-completions" },
	{ id: "inclusionai/ling-3.1-flash", name: "Ling 3.1 Flash", format: "chat-completions" },
	{ id: "meta/muse-spark-1.1", name: "Muse Spark 1.1", format: "chat-completions" },
	{ id: "meta/muse-spark-1.2", name: "Muse Spark 1.2", format: "chat-completions" },
	{
		id: "meta/muse-spark-1.2-contributor",
		name: "Muse Spark 1.2 Contributor",
		format: "chat-completions",
	},
	{ id: "meta/muse-spark-1.3", name: "Muse Spark 1.3", format: "chat-completions" },
	{
		id: "meta/muse-spark-1.3-contributor",
		name: "Muse Spark 1.3 Contributor",
		format: "chat-completions",
	},
	{ id: "meta/muse-spark-open", name: "Muse Spark Open", format: "chat-completions" },
	{ id: "meta/muse-wonder-1.0", name: "Muse Wonder", format: "chat-completions" },
	{ id: "xai/grok-4.5", name: "Grok 4.5", format: "chat-completions" },
	{ id: "xai/grok-4.6", name: "Grok 4.6", format: "chat-completions" },
	{ id: "xai/grok-4.7", name: "Grok 4.7", format: "chat-completions" },
	{ id: "mistral/mistral-large-4", name: "Mistral Large 4", format: "chat-completions" },
] as const satisfies readonly ChatModel[];

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;

export function getChatModel(id: string) {
	return CHAT_MODELS.find((model) => model.id === id);
}

export const askUser = tool({
	description:
		"Ask the user clarifying questions when their request is ambiguous. Provide one or more questions, each with exactly 3 short, distinct answer choices. The user can also answer in their own words.",
	inputSchema: z.object({
		questions: z
			.array(
				z.object({
					question: z.string().describe("The question to ask"),
					choices: z.array(z.string()).length(3).describe("Exactly three short answer choices"),
				}),
			)
			.min(1)
			.describe("The questions to ask the user"),
	}),
	outputSchema: z
		.array(z.object({ question: z.string(), answer: z.string() }))
		.describe("The user's answer to each question"),
});

export const githubRepo = tool({
	description:
		"Get public stats for a GitHub repository: stars, forks, open issues, language, and description.",
	inputSchema: z.object({
		repo: z
			.string()
			.regex(/^[\w.-]+\/[\w.-]+$/, 'Must be in "owner/name" format.')
			.describe('The repository in "owner/name" format, e.g. "vercel/next.js"'),
	}),
	outputSchema: z.union([
		z.object({ error: z.string() }),
		z.object({
			repo: z.string(),
			description: z.string(),
			stars: z.number(),
			forks: z.number(),
			openIssues: z.number(),
			language: z.string(),
			url: z.string(),
		}),
	]),
	execute: async ({ repo }, { abortSignal }) => {
		const timeout = AbortSignal.timeout(5000);
		const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;

		try {
			const res = await fetch(`https://api.github.com/repos/${repo}`, {
				headers: { accept: "application/vnd.github+json" },
				signal,
			});
			if (!res.ok) {
				return { error: `Could not find repository ${repo}.` };
			}
			const data = await res.json();
			return {
				repo: String(data.full_name ?? repo),
				description: String(data.description ?? ""),
				stars: Number(data.stargazers_count ?? 0),
				forks: Number(data.forks_count ?? 0),
				openIssues: Number(data.open_issues_count ?? 0),
				language: String(data.language ?? "Unknown"),
				url: String(data.html_url ?? `https://github.com/${repo}`),
			};
		} catch {
			return { error: `Could not reach GitHub for ${repo}.` };
		}
	},
});

export const CHAT_TOOLS = {
	github_repo: githubRepo,
	ask_user: askUser,
};

export type ChatUIMessage = UIMessage<
	{
		// Milliseconds per reasoning part, keyed by its index in the message.
		reasoningDurations?: Record<number, number>;
	},
	UIDataTypes,
	InferUITools<typeof CHAT_TOOLS>
>;

export type ChatMessagePart = ChatUIMessage["parts"][number];

export type TextMessagePart = Extract<ChatMessagePart, { type: "text" }>;

export type ReasoningMessagePart = Extract<ChatMessagePart, { type: "reasoning" }>;

export type SourceUrlPart = Extract<ChatMessagePart, { type: "source-url" }>;

export type GithubRepoToolPart = Extract<ChatMessagePart, { type: "tool-github_repo" }>;

export type AskUserToolPart = Extract<ChatMessagePart, { type: "tool-ask_user" }>;
