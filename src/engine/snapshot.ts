import type {
	AgentSession,
	CacheWarmingStatus,
	SessionEntry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

import type {
	Notice,
	ServerFrame,
	TranscriptEntry,
	TreeEntry,
} from "#protocol/conversation/frames";
import type { CommandOffer } from "#protocol/conversation/palette";
import type { ThinkingLevel } from "#protocol/conversation/session";
import type { CacheWarming, SessionStats } from "#protocol/usage";

import { BUILTIN_COMMANDS, builtinCommand } from "../domain/conversation/commands.ts";
import { withDefined } from "../domain/object.ts";
import { hasCodingTools } from "./tools.ts";
import { flatTree, transcriptOf } from "./translate.ts";

/**
 * What a tab receives when it attaches: a window of the branch, not the whole file.
 *
 * The window is bounded twice (rows and bytes) because a 46 MB chat must not become a
 * 46 MB frame. The tree is not here: it is read once when the picker opens, flat, so
 * neither the snapshot nor the schema recurses over 50,000 entries.
 */

export const windowRows = 50;
export const windowBytes = 2 * 1024 * 1024;

export type Window = {
	readonly entries: ReadonlyArray<TranscriptEntry>;
	readonly hasOlder: boolean;
};

type Row = { readonly entry: TranscriptEntry; readonly bytes: number };

const rowBytes = (entry: TranscriptEntry): number => JSON.stringify(entry).length;

const rowsOf = (entries: ReadonlyArray<SessionEntry>): Row[] => {
	const rows: Row[] = [];
	for (const entry of entries) {
		const transcript = transcriptOf(entry);
		if (transcript !== undefined) rows.push({ bytes: rowBytes(transcript), entry: transcript });
	}
	return rows;
};

/**
 * The newest page: stop at the row limit or the byte limit, whichever comes first. A
 * single oversized row is still sent (already cut to 64 KB), so the page always has the
 * last message.
 */
const pageAt = (rows: ReadonlyArray<Row>, endExclusive: number): Window => {
	let index = endExclusive - 1;
	let bytes = 0;
	let count = 0;
	while (index >= 0) {
		const row = rows[index];
		if (row === undefined) break;
		const nextBytes = bytes + row.bytes;
		const over = count >= windowRows || (count > 0 && nextBytes > windowBytes);
		if (over) break;
		bytes = nextBytes;
		count++;
		index--;
	}
	const entries: TranscriptEntry[] = [];
	for (let at = index + 1; at < endExclusive; at++) {
		const row = rows[at];
		if (row !== undefined) entries.push(row.entry);
	}
	return { entries, hasOlder: index >= 0 };
};

export const snapshotWindow = (agent: AgentSession): Window => {
	const rows = rowsOf(agent.sessionManager.buildContextEntries());
	return pageAt(rows, rows.length);
};

/** The page before `before`, for a tab that scrolled to the top of what it has. */
export const historyWindow = (agent: AgentSession, before: string): Window | undefined => {
	const rows = rowsOf(agent.sessionManager.buildContextEntries());
	const index = rows.findIndex((row) => row.entry.id === before);
	if (index < 0) return undefined;
	return pageAt(rows, index);
};

/** Compaction and branch summaries are rows the wire shows as notices. */
export const noticesOf = (sessionManager: SessionManager): Notice[] => {
	const notices: Notice[] = [];
	for (const entry of sessionManager.buildContextEntries()) {
		if (entry.type === "compaction") {
			notices.push({
				afterEntryId: entry.parentId,
				id: entry.id,
				kind: "compaction",
				text: entry.summary,
			});
		}
		if (entry.type === "branch_summary") {
			notices.push({
				afterEntryId: entry.parentId,
				id: entry.id,
				kind: "notice",
				text: entry.summary,
			});
		}
	}
	return notices;
};

/** The branch tree, flat, with the branch the page shows marked. */
export const treeOf = (sessionManager: SessionManager): TreeEntry[] => {
	const onPath = new Set(sessionManager.getBranch().map((entry) => entry.id));
	return flatTree(sessionManager.getTree(), onPath);
};

type MutableSessionMeta = {
	sessionId: string;
	t: "sessionMeta";
	title?: string;
	model?: string;
	thinking?: ThinkingLevel;
	tools?: string[];
	autoCompaction?: boolean;
	autoRetry?: boolean;
	codingTools?: boolean;
	hideThinking?: boolean;
	thinkingLevels?: ThinkingLevel[];
	commands?: CommandOffer[];
};

/**
 * What the composer reads under the box. pi's price model (`decision`) and whether an
 * extension overrode it stay out: the footer says when a warm happens and why not, not
 * what pi expected it to save.
 */
const warmingOf = (status: CacheWarmingStatus | undefined): CacheWarming | undefined => {
	if (status === undefined) return undefined;
	return withDefined(
		withDefined({ state: status.state }, "reason", status.reason),
		"nextWarmAt",
		status.nextWarmAt,
	);
};

/** What the session has cost, as pi summed it. */
const statsOf = (stats: SessionStats): SessionStats => ({
	assistantMessages: stats.assistantMessages,
	cost: stats.cost,
	tokens: {
		cacheRead: stats.tokens.cacheRead,
		cacheWrite: stats.tokens.cacheWrite,
		input: stats.tokens.input,
		output: stats.tokens.output,
		total: stats.tokens.total,
	},
	toolCalls: stats.toolCalls,
	totalMessages: stats.totalMessages,
	userMessages: stats.userMessages,
});

/** The composer's readings, as pi answered them. */
export const readingsOf = (agent: AgentSession): Extract<ServerFrame, { t: "readings" }> => {
	const frame: Extract<ServerFrame, { t: "readings" }> = {
		stats: statsOf(agent.getSessionStats()),
		t: "readings",
	};
	const withUsage = withDefined(frame, "contextUsage", agent.getContextUsage());
	return withDefined(withUsage, "cacheWarming", warmingOf(agent.cacheWarmingStatus));
};

/**
 * What `/` offers: pi's built-in commands first, then the extension commands, prompt
 * templates and skills `prompt()` still dispatches. A builtin wins over a name it
 * shadows, the way pi's editor does; `shadowedCommandsOf` names the losers so a tab
 * hears about it instead of a command quietly disappearing.
 */
const commandsOf = (agent: AgentSession): CommandOffer[] => {
	const commands: CommandOffer[] = BUILTIN_COMMANDS.map((command) => {
		const offer: CommandOffer = {
			description: command.description,
			name: command.name,
			source: "builtin",
		};
		return withDefined(
			offer,
			"argumentHint",
			"argumentHint" in command ? command.argumentHint : undefined,
		);
	});
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		if (builtinCommand(command.invocationName) !== undefined) continue;
		commands.push({
			description: command.description,
			name: command.invocationName,
			source: "extension",
		});
	}
	for (const template of agent.promptTemplates) {
		if (builtinCommand(template.name) !== undefined) continue;
		const offer: CommandOffer = {
			description: template.description,
			name: template.name,
			source: "prompt",
		};
		commands.push(withDefined(offer, "argumentHint", template.argumentHint));
	}
	// pi's setting only hides the entries; `prompt()` still expands a typed
	// `/skill:name`, so manual entry keeps working with the palette off.
	if (agent.settingsManager.getEnableSkillCommands()) {
		for (const skill of agent.resourceLoader.getSkills().skills) {
			commands.push({
				description: skill.description,
				name: `skill:${skill.name}`,
				source: "skill",
			});
		}
	}
	return commands;
};

/**
 * Extension commands and templates a builtin takes the name from. pi's editor answers
 * the builtin, so the extension one is unreachable from `/` here.
 */
export const shadowedCommandsOf = (agent: AgentSession): string[] => {
	const shadowed = new Set<string>();
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		if (builtinCommand(command.invocationName) !== undefined) {
			shadowed.add(command.invocationName);
		}
	}
	for (const template of agent.promptTemplates) {
		if (builtinCommand(template.name) !== undefined) shadowed.add(template.name);
	}
	return [...shadowed];
};

/** What the page needs to draw the session controls, from pi's own state. */
export const sessionMeta = (agent: AgentSession): Extract<ServerFrame, { t: "sessionMeta" }> => {
	const title = agent.sessionManager.getSessionName();
	const model = agent.model === undefined ? undefined : `${agent.model.provider}/${agent.model.id}`;
	const frame: MutableSessionMeta = {
		autoCompaction: agent.autoCompactionEnabled,
		autoRetry: agent.autoRetryEnabled,
		codingTools: hasCodingTools(agent),
		commands: commandsOf(agent),
		hideThinking: agent.settingsManager.getHideThinkingBlock(),
		sessionId: agent.sessionId,
		t: "sessionMeta",
		thinking: agent.thinkingLevel,
		thinkingLevels: agent.getAvailableThinkingLevels(),
		tools: agent.getActiveToolNames(),
	};
	if (title !== undefined) frame.title = title;
	if (model !== undefined) frame.model = model;
	return frame;
};
