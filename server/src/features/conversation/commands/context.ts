/**
 * What a command handler may ask of the chat that owns it. `LiveSession` builds
 * one of these per command, so a handler reads the engine and says what changed
 * without touching the engine's lifetime, the tab fan-out or the file watcher.
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AutocompleteReply, PromptQueue, SnapshotModel } from "shared";

import type { AgentHome } from "../../../platform/agent-home";
import type { SessionHost } from "../host/host";

export type CommandTarget = {
	/** The live pi session. A command never runs without one. */
	agent: AgentSession;
	/** The runtime around it, for the operations that can replace the session. */
	host: SessionHost;
	home: AgentHome;
	/** The models the picker was offered, so `set_model` cannot name a refused pair. */
	models: SnapshotModel[];
	/** Drop every open extension question; only an abort does that. */
	cancelDialogs(): void;
	/** One sentence for the transcript. */
	notice(text: string): void;
	/** A failure that arrived after the command was already accepted. */
	fail(error: Error): void;
	/** Re-read the snapshot for every tab watching this chat. */
	resync(): void;
	/**
	 * Prompts pi still held when a command took them back, so the tab can put them in
	 * the composer instead of losing text the user typed. Only one command returns one.
	 */
	returnQueue(queue: PromptQueue): void;
	/** Ask the extension autocomplete providers what they suggest at the cursor. */
	suggestions(text: string, cursor: number): Promise<AutocompleteReply>;
	/** What that chain answered, for the `command-result` frame. */
	returnAutocomplete(reply: AutocompleteReply): void;
	reload(): Promise<void>;
	reloadFromDisk(): Promise<void>;
};
