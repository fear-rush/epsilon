/**
 * The snapshot a tab receives on attach: pi's transcript, its models and what
 * `/` can expand, read synchronously from the live engine. The transcript is
 * pi's; nothing here is stored on the server.
 *
 * `readModelsFrom` is the models this engine will actually accept. pi's synchronous
 * `getAvailableSnapshot()` is a cached view and can be smaller than the truth: on
 * a home with only `auth.json` and `settings.json` it answered 420 where the
 * auth-checked call answered 514 (openrouter 387 against 481). The picker offers this
 * list and `set_model` resolves against it, so the browser can never pick a model the
 * engine then refuses, and never misses one a terminal `pi` would offer.
 *
 * The auth-checked call resolves credentials per provider, so it is bounded: a
 * provider whose check hangs must not hold a snapshot hostage.
 */
import type {
	AgentSession,
	ContextUsage as PiContextUsage,
	ModelRuntime,
	SessionMessageEntry,
	SessionStats as PiSessionStats,
} from "@earendil-works/pi-coding-agent";
import { isVisibleMessage } from "shared";
import type {
	ContextUsage,
	Place,
	Snapshot,
	SnapshotBranch,
	SnapshotCommand,
	SnapshotModel,
	SessionStats,
} from "shared";

import { hasCodingTools } from "./engine";

const AUTH_CHECK_TIMEOUT_MS = 3_000;

type NamedModel = { provider: string; id: string; name: string };

const toSnapshot = (models: readonly NamedModel[]): SnapshotModel[] =>
	models.map((model) => ({ provider: model.provider, id: model.id, name: model.name }));

export const readModelsFrom = async (runtime: ModelRuntime): Promise<SnapshotModel[]> => {
	try {
		const available = await runtime.getAllAvailable(undefined, {
			signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
		});
		return toSnapshot(available);
	} catch {
		// Slow or failing auth resolution falls back to pi's cache: fewer models is
		// better than an empty picker.
		return toSnapshot(runtime.getAvailableSnapshot());
	}
};

const commandsOf = (agent: AgentSession): SnapshotCommand[] => {
	const commands: SnapshotCommand[] = [];
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		commands.push({
			name: command.invocationName,
			description: command.description,
			source: "extension",
		});
	}
	for (const template of agent.promptTemplates) {
		commands.push({ name: template.name, description: template.description, source: "prompt" });
	}
	for (const skill of agent.resourceLoader.getSkills().skills) {
		commands.push({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
		});
	}
	return commands;
};

/**
 * pi answers `null` for both the token count and the percentage while the context is
 * unknown: the state right after a compaction, until a model responds again. Before
 * a model is chosen there is no reading at all. Neither is a number, so an unknown
 * context is absent rather than zero.
 */
const contextUsageOf = (usage: PiContextUsage | undefined): ContextUsage | undefined => {
	if (usage === undefined || usage.tokens === null || usage.percent === null) return undefined;
	return { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent };
};

/** pi's totals, narrowed to what the page shows; `cost` is in the provider's currency. */
const statsOf = (stats: PiSessionStats): SessionStats => ({
	tokens: {
		input: stats.tokens.input,
		output: stats.tokens.output,
		cacheRead: stats.tokens.cacheRead,
		cacheWrite: stats.tokens.cacheWrite,
		total: stats.tokens.total,
	},
	cost: stats.cost,
	userMessages: stats.userMessages,
	assistantMessages: stats.assistantMessages,
	toolCalls: stats.toolCalls,
	totalMessages: stats.totalMessages,
});

/**
 * A user message's content is a string or content parts of text and images. The
 * composer gets the text back whole: it is a draft to edit, not a preview.
 */
type UserContent = Extract<SessionMessageEntry["message"], { role: "user" }>["content"];

const textOfContent = (content: UserContent): string => {
	if (!Array.isArray(content)) return content;
	return content.map((part) => (part.type === "text" ? part.text : "")).join("");
};

/**
 * The user messages of the branch pi currently holds, root to leaf. Going back to
 * one of them moves the leaf to just before it and starts a sibling branch from the
 * next prompt; other branches are not listed (docs/DECISIONS.md, Branching).
 */
const branchesOf = (agent: AgentSession): SnapshotBranch[] => {
	const branches: SnapshotBranch[] = [];
	for (const entry of agent.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "user") continue;
		const text = textOfContent(entry.message.content);
		if (text.trim() === "") continue;
		branches.push({ entryId: entry.id, text });
	}
	return branches;
};

export const buildSnapshot = (
	agent: AgentSession,
	models: SnapshotModel[],
	place: Place,
): Snapshot => {
	const model = agent.model;
	return {
		state: {
			model:
				model === undefined
					? undefined
					: { provider: model.provider, id: model.id, name: model.name },
			isStreaming: agent.isStreaming,
			isCompacting: agent.isCompacting,
			sessionName: agent.sessionName,
			thinkingLevel: agent.thinkingLevel,
			availableThinkingLevels: agent.getAvailableThinkingLevels(),
			place,
			codingTools: hasCodingTools(agent),
			contextUsage: contextUsageOf(agent.getContextUsage()),
			stats: statsOf(agent.getSessionStats()),
			isRetrying: agent.isRetrying,
			isBashRunning: agent.isBashRunning,
			autoCompaction: agent.autoCompactionEnabled,
			autoRetry: agent.autoRetryEnabled,
			queue: {
				steering: [...agent.getSteeringMessages()],
				followUp: [...agent.getFollowUpMessages()],
			},
			branches: branchesOf(agent),
		},
		messages: agent.messages.filter(isVisibleMessage),
		// The list the session carries, so the picker and `set_model` agree
		// (`readModelsFrom`). Reading pi's cache here is how they drifted apart.
		models,
		commands: commandsOf(agent),
	};
};
