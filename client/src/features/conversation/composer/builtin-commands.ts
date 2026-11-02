/**
 * The built-in commands the browser answers itself: pi's rows whose surface is a
 * route, a dialog, the clipboard or a download (`shared/src/conversation/commands.ts`).
 * The host runs the rest; nothing here reaches the model, and every branch returns
 * either nothing or the sentence the composer shows instead of acting.
 */
import { transcript } from "shared";
import type {
	BuiltinCommand,
	ComposerCommandName,
	ConversationState,
	SnapshotModel,
	SnapshotTreeNode,
	ThinkingLevel,
} from "shared";

import { shortcut } from "@/components/patterns/shortcut";
import { costLabel } from "@/features/conversation/cost";
import { downloadExport } from "@/features/conversation/export-file";
import type { ConversationStore } from "@/features/conversation/store";

/** Where a route-only command goes, resolved by the composer's router. */
export type RouteTarget = "settings" | "providers" | "chats";

export type ComposerCommandContext = {
	store: ConversationStore;
	/** What the model picker offers, so a name resolves against the same list. */
	models: readonly SnapshotModel[];
	/** The session tree, so `/tree` knows whether there is anywhere to go. */
	tree: readonly SnapshotTreeNode[];
	/** What this model reports, so a level is never set to one pi refuses. */
	thinkingLevels: readonly ThinkingLevel[];
	/** A chat with no message has nothing to fork, clone, move to or export yet. */
	empty: boolean;
	/** Why pi refuses a branch action right now; undefined when it is possible. */
	blocked: string | undefined;
	/** The page's own surfaces, absent where the page does not offer them. */
	openTree: (() => void) | undefined;
	openFork: (() => void) | undefined;
	clone: (() => void) | undefined;
	openModelMenu: () => void;
	openThinkingMenu: () => void;
	navigate: (to: RouteTarget) => void;
};

/** A notice line, or undefined when the command did something visible enough. */
type Handler = (
	argument: string,
	context: ComposerCommandContext,
) => string | undefined | Promise<string | undefined>;

/** The last reply's prose, which is what pi's `/copy` puts on the clipboard. */
const lastAssistantText = (state: ConversationState): string | undefined => {
	const replies = transcript(state).filter(
		(row) => row.kind === "assistant" && row.text.trim() !== "",
	);
	const last = replies.at(-1);
	return last?.kind === "assistant" ? last.text : undefined;
};

/** `/export` reads pi's own rule: HTML unless the argument asks for JSONL. */
const exportFormat = (argument: string): "html" | "jsonl" | undefined => {
	if (argument === "") return "html";
	return argument === ".jsonl" || argument === "jsonl" ? "jsonl" : undefined;
};

/** How a model is named in a sentence and in `/model`'s argument: `provider/id`. */
const modelLabel = (model: SnapshotModel): string => `${model.provider}/${model.id}`;

const HANDLERS = {
	settings: (_argument, { navigate }) => {
		navigate("settings");
		return undefined;
	},
	model: (argument, { models, openModelMenu, store }) => {
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
		store.setModel(match.provider, match.id);
		return undefined;
	},
	tree: (_argument, { blocked, empty, openTree, tree: nodes }) => {
		if (blocked !== undefined) return blocked;
		if (empty || nodes.length === 0) return "The session tree has no message yet. Send one first.";
		if (openTree === undefined) return "The session tree is not available on this page.";
		openTree();
		return undefined;
	},
	thinking: (argument, { openThinkingMenu, store, thinkingLevels }) => {
		const target = argument.trim().toLowerCase();
		if (target === "") {
			openThinkingMenu();
			return undefined;
		}
		const match = thinkingLevels.find((candidate) => candidate === target);
		if (match === undefined) {
			return `"${argument}" is not a thinking level for this model: ${thinkingLevels.join(", ")}.`;
		}
		store.setThinkingLevel(match);
		return undefined;
	},
	"scoped-models": (_argument, { navigate }) => {
		// General holds the one field pi resolves `enabledModels` with.
		navigate("settings");
		return undefined;
	},
	export: async (argument, { empty, store }) => {
		const format = exportFormat(argument.trim());
		if (format === undefined) {
			return "Epsilon downloads the export, so it takes no path: /export saves HTML and /export .jsonl saves pi's JSONL.";
		}
		if (empty) return "This chat has nothing to export yet.";
		try {
			await downloadExport(store.sessionId, format);
		} catch (cause) {
			return `The export failed: ${cause instanceof Error ? cause.message : String(cause)}`;
		}
		return undefined;
	},
	copy: async (_argument, { store }) => {
		const text = lastAssistantText(store.getSnapshot().state);
		if (text === undefined) return "There is no agent reply to copy yet.";
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return "This browser refused clipboard access. Select the reply and copy it instead.";
		}
		return "Copied the last agent reply to the clipboard.";
	},
	session: (_argument, { store }) => {
		const { state } = store.getSnapshot();
		const name = state.sessionName === undefined ? "untitled" : `"${state.sessionName}"`;
		const model = state.model === undefined ? "no model yet" : modelLabel(state.model);
		const counted = `${state.stats.totalMessages} messages, ${state.stats.tokens.total.toLocaleString()} tokens, ${costLabel(state.stats.cost)} spent`;
		return `Chat ${name}: ${model}, ${counted}.`;
	},
	hotkeys: () =>
		`Enter sends, and steers a run that is already going. ${shortcut("Enter")} waits for that run to settle, Shift+Enter adds a line, Esc stops the run, and / lists every command.`,
	fork: (_argument, { blocked, empty, openFork }) => {
		if (blocked !== undefined) return blocked;
		if (empty) return "Fork needs a message first.";
		if (openFork === undefined) return "Fork is not available on this page.";
		openFork();
		return undefined;
	},
	clone: (_argument, { blocked, clone, empty }) => {
		if (blocked !== undefined) return blocked;
		if (empty) return "Clone needs a message first.";
		if (clone === undefined) return "Clone is not available on this page.";
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
} satisfies Record<ComposerCommandName, Handler>;

/**
 * Run one command the browser serves. A `refusal` row never calls a handler: its
 * sentence names where the ability lives instead.
 */
export const runComposerCommand = async (
	command: BuiltinCommand,
	argument: string,
	context: ComposerCommandContext,
): Promise<string | undefined> => {
	if (command.refusal !== undefined) return command.refusal;
	// SAFETY: `HANDLERS` was checked with `satisfies Record<ComposerCommandName,
	// Handler>`, so every key it has is a browser command name.
	const handler = Object.hasOwn(HANDLERS, command.name)
		? HANDLERS[command.name as ComposerCommandName]
		: undefined;
	if (handler === undefined) {
		return `/${command.name} is not wired in this build.`;
	}
	return handler(argument, context);
};
