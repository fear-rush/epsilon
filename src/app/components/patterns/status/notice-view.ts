import { BUILTIN_COMMANDS } from "#domain/conversation/commands";
import type { Notice } from "#protocol/conversation/frames";

import type { Tone } from "./status-tone";

/** What a chat notice says: one tone, its words, and the button it may carry. */
export type NoticeView = {
	tone: Tone;
	text: string;
	/** A spinner instead of the tone's icon: something is being fixed right now. */
	spinner?: boolean;
	action?: "diagnostics";
};

type EpsilonNotice = Extract<Notice, { source: "epsilon" }>;

/** The compile-time proof that every code has words: a code without a case reaches `never`. */
const noWords = (code: never): NoticeView => {
	throw new Error(`no words for notice code "${String(code)}"`);
};

/** The sentence a browser-side command gives instead of running in the chat. */
const unavailable = (name: string): string => {
	const row = BUILTIN_COMMANDS.find((command) => command.name === name);
	const refusal = row !== undefined && "refusal" in row ? row.refusal : undefined;
	return refusal ?? `/${name} runs in the page, so nothing was sent to the model.`;
};

/**
 * The words for a notice Epsilon raised. A new code in `NoticeCode` does not type-check
 * until this switch has a case for it, so the server never sends a sentence.
 */
function epsilonView(notice: EpsilonNotice): NoticeView {
	const data = notice.data;
	const part = (key: string): string => data[key] ?? "";
	switch (notice.code) {
		case "engine-crashed":
			return { tone: "danger", text: `This chat stopped (${part("exit")})`, action: "diagnostics" };
		case "engine-restarting":
			return { tone: "info", text: "Restarting the engine…", spinner: true };
		case "engine-unresponsive":
			return { tone: "warning", text: "This chat isn't responding" };
		case "engine-out-of-memory":
			return { tone: "danger", text: "This chat ran out of memory", action: "diagnostics" };
		case "slot-freed":
			return { tone: "info", text: "Closed to free a slot. Send a message to reopen it." };
		case "extensions-failed":
			return { tone: "danger", text: `Extensions didn't start: ${part("reason")}` };
		case "run-failed":
			return { tone: "danger", text: `The run failed: ${part("reason")}` };
		case "readings-unreadable":
			return { tone: "warning", text: `Couldn't read this chat's usage: ${part("reason")}` };
		case "extension-closed-chat":
			return {
				tone: "warning",
				text: "An extension closed this chat. Send a message to reopen it.",
			};
		case "session-unbound":
			return { tone: "danger", text: `Couldn't open the new session: ${part("reason")}` };
		case "command-shadowed":
			return {
				tone: "warning",
				text: `/${part("name")} is shadowed by pi's built-in /${part("name")}`,
			};
		case "retrying":
			return { tone: "info", text: `Retrying after a failed request: ${part("reason")}` };
		case "import-done":
			return { tone: "info", text: `Imported ${part("file")}` };
		case "chat-name":
			return {
				tone: "info",
				text:
					data["name"] === undefined
						? "This chat has no name. Use /name <name>."
						: `This chat is called "${part("name")}". Use /name <name> to change it.`,
			};
		case "command-unavailable":
			return { tone: "info", text: unavailable(part("name")) };
		case "command-failed":
			return { tone: "warning", text: `/${part("name")}: ${part("reason")}` };
		case "chat-ended":
			return { tone: "info", text: "The chat stopped. Send a message to restart it." };
		case "chat-error":
			return { tone: "danger", text: part("reason") };
		default:
			return noWords(notice.code);
	}
}

/** The view of any notice: pi's words as they came, Epsilon's from its code. */
export function noticeView(notice: Notice): NoticeView {
	if (notice.source === "epsilon") return epsilonView(notice);
	return {
		tone: notice.kind === "error" ? "danger" : notice.kind === "warning" ? "warning" : "info",
		text: notice.text,
	};
}
