/**
 * The snapshot a tab receives on attach: pi's transcript, its models, the session
 * tree and what `/` offers, read synchronously from the live engine. The
 * transcript is pi's; nothing here is stored on the server.
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
	SessionEntry,
	SessionMessageEntry,
	SessionStats as PiSessionStats,
	SessionTreeNode,
} from "@earendil-works/pi-coding-agent";
import { resolveModelScopeWithDiagnostics } from "@earendil-works/pi-coding-agent";
import { EPSILON_COMMANDS, isVisibleMessage } from "shared";
import type {
	ContextUsage,
	Place,
	Snapshot,
	SnapshotCommand,
	SnapshotModel,
	SnapshotTreeNode,
	SessionStats,
} from "shared";

import { hasCodingTools } from "./engine";

const AUTH_CHECK_TIMEOUT_MS = 3_000;

type NamedModel = { provider: string; id: string; name: string };

const toSnapshot = (models: readonly NamedModel[]): SnapshotModel[] =>
	models.map((model) => ({ provider: model.provider, id: model.id, name: model.name }));

/** What `enabledModels` narrowed the catalog to, and why a pattern matched nothing. */
type ModelScope = {
	matched: number;
	available: number;
	diagnostics: string[];
};

/** Every model the engine accepts, the ones the picker may offer, and the scope. */
export type ModelOffers = {
	models: SnapshotModel[];
	scoped: SnapshotModel[];
	scope: ModelScope | undefined;
};

/**
 * pi resolves `enabledModels` itself (`resolveModelScopeFromModels`, the same
 * matcher `--models` uses), so Epsilon only renders the answer. A scope that hides
 * the model a session is already using is not applied to that session's current
 * model; `buildSnapshot` keeps it in the list rather than lying about it.
 */
export const readModelsFrom = async (
	runtime: ModelRuntime,
	patterns: string[] | null = null,
): Promise<ModelOffers> => {
	const available = await availableModels(runtime);
	if (patterns === null || patterns.length === 0) {
		return { models: toSnapshot(available), scoped: toSnapshot(available), scope: undefined };
	}
	try {
		const result = await resolveModelScopeWithDiagnostics(patterns, runtime, {
			signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
		});
		return {
			models: toSnapshot(available),
			scoped: toSnapshot(result.scopedModels.map((entry) => entry.model)),
			scope: {
				matched: result.scopedModels.length,
				available: available.length,
				diagnostics: result.diagnostics.map(
					(diagnostic) => `${diagnostic.pattern}: ${diagnostic.message}`,
				),
			},
		};
	} catch {
		// A scope that cannot be resolved must not hide the catalog: offer every
		// model and say so, instead of an empty picker with no reason.
		return {
			models: toSnapshot(available),
			scoped: toSnapshot(available),
			scope: {
				matched: available.length,
				available: available.length,
				diagnostics: ["The model scope could not be resolved, so every model is offered."],
			},
		};
	}
};

const availableModels = async (runtime: ModelRuntime) => {
	try {
		return await runtime.getAllAvailable(undefined, {
			signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
		});
	} catch {
		// Slow or failing auth resolution falls back to pi's cache: fewer models is
		// better than an empty picker.
		return runtime.getAvailableSnapshot();
	}
};

const commandsOf = (agent: AgentSession): SnapshotCommand[] => {
	// Epsilon runs these in the composer before a prompt exists, so a pi command
	// that took one of the names would never be reached. Epsilon's wins.
	const localNames = new Set<string>(EPSILON_COMMANDS.map((command) => command.name));
	const commands: SnapshotCommand[] = EPSILON_COMMANDS.map((command) => ({ ...command }));
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		if (localNames.has(command.invocationName)) continue;
		commands.push({
			name: command.invocationName,
			description: command.description,
			source: "extension",
		});
	}
	for (const template of agent.promptTemplates) {
		if (localNames.has(template.name)) continue;
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

/** How much of a reply or a summary a tree row shows; a user message keeps its whole text. */
const PREVIEW_LENGTH = 160;

/** One line of a text, for a row that must stay small however long the message is. */
const previewOf = (text: string): string => {
	const line = text.trim().replace(/\s+/g, " ");
	return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/** A point the picker can move to. Tool results and state entries have no row of their own. */
const pickable = (entry: SessionEntry): boolean =>
	(entry.type === "message" &&
		(entry.message.role === "user" || entry.message.role === "assistant")) ||
	entry.type === "branch_summary" ||
	entry.type === "compaction";

type TreeRow = Omit<SnapshotTreeNode, "children">;

/** One row of the tree, or undefined when the entry is folded into its nearest ancestor. */
const rowOf = (
	node: SessionTreeNode,
	activeIds: Set<string>,
	currentId: string | undefined,
): TreeRow | undefined => {
	const entry = node.entry;
	let row: Pick<TreeRow, "entryId" | "kind" | "text"> | undefined;
	if (entry.type === "message" && entry.message.role === "user") {
		row = { entryId: entry.id, kind: "user", text: textOfContent(entry.message.content) };
	} else if (entry.type === "message" && entry.message.role === "assistant") {
		const content = entry.message.content;
		const text = content.map((part) => (part.type === "text" ? part.text : "")).join("");
		const thinking = content
			.map((part) => (part.type === "thinking" ? part.thinking : ""))
			.join("");
		const tools = content.flatMap((part) => (part.type === "toolCall" ? [part.name] : []));
		row = {
			entryId: entry.id,
			kind: "assistant",
			text:
				text.trim() !== ""
					? previewOf(text)
					: thinking.trim() !== ""
						? previewOf(thinking)
						: tools.length > 0
							? `Tool call: ${tools.join(", ")}`
							: previewOf(entry.message.errorMessage ?? "No text"),
		};
	} else if (entry.type === "branch_summary" || entry.type === "compaction") {
		row = { entryId: entry.id, kind: "summary", text: previewOf(entry.summary) };
	}
	if (row === undefined) return undefined;
	return {
		...row,
		label: node.label,
		active: activeIds.has(entry.id),
		current: entry.id === currentId,
	};
};

const flattenTree = (
	nodes: SessionTreeNode[],
	activeIds: Set<string>,
	currentId: string | undefined,
): SnapshotTreeNode[] => {
	const rows: SnapshotTreeNode[] = [];
	for (const node of nodes) {
		const children = flattenTree(node.children, activeIds, currentId);
		const row = rowOf(node, activeIds, currentId);
		if (row === undefined) rows.push(...children);
		else rows.push({ ...row, children });
	}
	return rows;
};

/**
 * The session tree, one node per pickable entry, with the active branch marked.
 * Navigating to any node moves pi's leaf there: a user message goes back to the
 * composer, another entry continues after it. This is how an abandoned branch
 * stays reachable (docs/DECISIONS.md, Branching).
 */
const treeOf = (agent: AgentSession): SnapshotTreeNode[] => {
	const branch = agent.sessionManager.getBranch();
	const activeIds = new Set(branch.map((entry) => entry.id));
	const currentId = [...branch].reverse().find(pickable)?.id;
	return flattenTree(agent.sessionManager.getTree(), activeIds, currentId);
};

/** The model in use stays offered even when `enabledModels` does not match it. */
const withCurrent = (models: SnapshotModel[], model: AgentSession["model"]): SnapshotModel[] => {
	if (model === undefined) return models;
	const current = { provider: model.provider, id: model.id, name: model.name };
	return models.some(
		(candidate) => candidate.provider === current.provider && candidate.id === current.id,
	)
		? models
		: [...models, current];
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
			tree: treeOf(agent),
		},
		messages: agent.messages.filter(isVisibleMessage),
		// The list the session carries, so the picker and `set_model` agree
		// (`readModelsFrom`). A scope that excludes the model in use keeps it in
		// the list: hiding the truth would make the picker contradict the header.
		models: withCurrent(models, model),
		commands: commandsOf(agent),
	};
};
