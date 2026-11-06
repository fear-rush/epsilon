/**
 * The built-in commands the browser answers itself: pi's rows whose surface is a route,
 * a dialog or the clipboard. The engine answers the rest (`src/engine/slash.ts`), so no
 * name in the table reaches the model. Main's file, adapted from its store to this
 * branch's conversation hook.
 */
import type { BuiltinCommand, ComposerCommandName } from "#domain/conversation/commands";
import { cacheHitRate, costLabel, tokenLabel } from "#domain/conversation/format";
import { transcript } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { ExportedSession, ExportFormat } from "#protocol/conversation/export";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import type { ContextView } from "#protocol/settings/context";
import { shortcut } from "@/components/patterns/shortcut";
import { errorView } from "@/components/patterns/status/error-view";

import { downloadExport } from "../export-file";
import { contextSentence } from "../session-context-sentence";

/** Where a route-only command goes: the settings shell and the chat list are pages. */
export type RouteTarget = "settings" | "providers" | "chats";

export type ComposerCommandContext = {
	readonly state: ConversationState;
	/** What the model picker offers, so a name resolves against the same list. */
	readonly models: ReadonlyArray<ModelOption>;
	/** What this model reports, so a level is never set to one pi refuses. */
	readonly thinkingLevels: ReadonlyArray<ThinkingLevel>;
	/** A chat with no message has nothing to fork, move to or copy yet. */
	readonly empty: boolean;
	/** Why pi refuses a branch action right now; undefined when it is possible. */
	readonly blocked: string | undefined;
	/** The page's own surfaces. */
	readonly openTree: () => void;
	readonly openFork: () => void;
	readonly clone: () => void;
	readonly openModelMenu: () => void;
	readonly openThinkingMenu: () => void;
	readonly setModel: (provider: string, id: string) => void;
	readonly setThinking: (level: ThinkingLevel) => void;
	/** The context read `/session` quotes, from the same call the Context page makes. */
	readonly readContext: () => Promise<ContextView>;
	/** pi's own exporter, through the engine that owns the session. */
	readonly exportChat: (format: ExportFormat) => Promise<ExportedSession>;
	readonly navigate: (to: RouteTarget) => void;
};

/** A notice line, or undefined when the command did something visible enough. */
type Handler = (
	argument: string,
	context: ComposerCommandContext,
) => string | undefined | Promise<string | undefined>;

/** The last reply's prose, which is what pi's `/copy` puts on the clipboard. */
const lastAssistantText = (state: ConversationState): string | undefined => {
	const texts: string[] = [];
	for (const row of transcript(state)) {
		if (row.kind !== "entry" || row.entry.role !== "assistant") continue;
		texts.push(
			row.entry.blocks
				.filter((block) => block.type === "text")
				.map((block) => block.text)
				.join(""),
		);
	}
	return texts.findLast((text) => text.trim() !== "");
};

/** `/export` reads pi's own rule: HTML unless the argument asks for JSONL. */
const exportFormat = (argument: string): ExportFormat | undefined => {
	if (argument === "") return "html";
	return argument === ".jsonl" || argument === "jsonl" ? "jsonl" : undefined;
};

/** How a model is named in a sentence and in `/model`'s argument: `provider/id`. */
const modelLabel = (model: ModelOption): string => `${model.provider}/${model.id}`;

const HANDLERS: Partial<Record<ComposerCommandName, Handler>> = {
	settings: (_argument, { navigate }) => {
		navigate("settings");
		return undefined;
	},
	model: (argument, { models, openModelMenu, setModel }) => {
		const target = argument.trim();
		if (target === "") {
			openModelMenu();
			return undefined;
		}
		const byReference = models.filter((candidate) => modelLabel(candidate) === target);
		const matches =
			byReference.length > 0 ? byReference : models.filter((candidate) => candidate.id === target);
		const [match, ...rest] = matches;
		if (match === undefined) {
			return `No model here is called "${target}". The model menu lists what this home offers.`;
		}
		if (rest.length > 0) {
			return `"${target}" names ${matches.length} models. Use provider/model to pick one.`;
		}
		setModel(match.provider, match.id);
		return undefined;
	},
	tree: (_argument, { blocked, empty, openTree }) => {
		if (blocked !== undefined) return blocked;
		// The tree itself is read when the dialog opens, so an empty list here only means
		// no read has happened yet; the chat's messages are what this command needs.
		if (empty) return "The session tree has no message yet. Send one first.";
		openTree();
		return undefined;
	},
	thinking: (argument, { openThinkingMenu, setThinking, thinkingLevels }) => {
		const target = argument.trim().toLowerCase();
		if (target === "") {
			openThinkingMenu();
			return undefined;
		}
		const match = thinkingLevels.find((candidate) => candidate === target);
		if (match === undefined) {
			return `"${argument}" is not a thinking level for this model: ${thinkingLevels.join(", ")}.`;
		}
		setThinking(match);
		return undefined;
	},
	"scoped-models": (_argument, { navigate }) => {
		// General holds the one field pi resolves `enabledModels` with.
		navigate("settings");
		return undefined;
	},
	export: async (argument, { empty, exportChat }) => {
		const format = exportFormat(argument.trim());
		if (format === undefined) {
			return "Epsilon downloads the export, so it takes no path: /export saves HTML and /export .jsonl saves pi's JSONL.";
		}
		if (empty) return "This chat has nothing to export yet.";
		try {
			downloadExport(await exportChat(format));
		} catch (cause) {
			const view = errorView(cause instanceof Error ? cause : new Error(String(cause)));
			return `The export failed: ${view.line === "" ? view.title : view.line}`;
		}
		return undefined;
	},
	copy: async (_argument, { state }) => {
		const text = lastAssistantText(state);
		if (text === undefined) return "There is no agent reply to copy yet.";
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return "This browser refused clipboard access. Select the reply and copy it instead.";
		}
		return "Copied the last agent reply to the clipboard.";
	},
	session: async (_argument, { state, readContext }) => {
		const name = state.title === undefined ? "untitled" : `"${state.title}"`;
		const model = state.model ?? "no model yet";
		const stats = state.readings?.stats;
		const counted =
			stats === undefined
				? "no totals yet"
				: (() => {
						const { tokens } = stats;
						const share = cacheHitRate(tokens);
						return `${stats.totalMessages} messages, ${tokenLabel(tokens.total)} tokens (${tokenLabel(tokens.input)} input, ${tokenLabel(tokens.output)} output, ${tokenLabel(tokens.cacheRead)} cache read, ${tokenLabel(tokens.cacheWrite)} cache write${share === undefined ? "" : `, ${share.toFixed(0)}% from cache`}), ${costLabel(stats.cost)} spent`;
					})();
		// The context read is the same one the Context page names, so the two cannot
		// disagree about what this chat holds. A failure is said, not dropped.
		let context: string;
		try {
			context = contextSentence(await readContext());
		} catch (cause) {
			const view = errorView(cause instanceof Error ? cause : new Error(String(cause)));
			context = `The context could not be read: ${view.line === "" ? view.title : view.line}`;
		}
		return `Chat ${name}: ${model}, ${counted}. ${context}`;
	},
	hotkeys: () =>
		`Enter sends, and steers a run that is already going. ${shortcut("Enter")} waits for that run to settle, Shift+Enter adds a line, Esc stops the run, and / lists every command.`,
	fork: (_argument, { blocked, empty, openFork }) => {
		if (blocked !== undefined) return blocked;
		if (empty) return "Fork needs a message first.";
		openFork();
		return undefined;
	},
	clone: (_argument, { blocked, clone, empty }) => {
		if (blocked !== undefined) return blocked;
		if (empty) return "Clone needs a message first.";
		clone();
		return undefined;
	},
	login: (argument, { navigate }) => {
		const provider = argument.trim();
		if (provider === "") {
			navigate("providers");
			return undefined;
		}
		// Navigating away would take the sentence with it, and dropping the provider
		// silently is what a refusal is for.
		return `Provider sign-in lives in Settings, then Providers: sign ${provider} in there.`;
	},
	logout: (argument, { navigate }) => {
		const provider = argument.trim();
		if (provider === "") {
			navigate("providers");
			return undefined;
		}
		return `Signing ${provider} out happens in Settings, then Providers: remove its credential there.`;
	},
	resume: (_argument, { navigate }) => {
		navigate("chats");
		return undefined;
	},
};

/**
 * Run one command the browser serves. A `refusal` row never calls a handler: its sentence
 * names where the ability lives instead. A command this build has no surface for says so
 * with main's sentence rather than pretending.
 */
export const runComposerCommand = async (
	command: BuiltinCommand,
	argument: string,
	context: ComposerCommandContext,
): Promise<string | undefined> => {
	if (command.refusal !== undefined) return command.refusal;
	// The table's name is a string; only its browser rows are keys of `HANDLERS`, which
	// holds the surfaces this build has, so a missing key is a deliberate fallback.
	const handler = Object.entries(HANDLERS).find(([name]) => name === command.name)?.[1];
	if (handler === undefined) {
		return `/${command.name} is not wired in this build.`;
	}
	return handler(argument, context);
};
