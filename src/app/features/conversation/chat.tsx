import type { ConversationState } from "#domain/conversation/state";
import type { Notice as NoticeFrame } from "#protocol/conversation/frames";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { useReportStatus } from "@/status";
import type { StatusValue } from "@/status";

import { Composer } from "./composer";
import { ConversationDialogs } from "./dialogs";
import { Transcript } from "./transcript";
import { useConversation } from "./use-conversation";

/**
 * One chat: the bar, the transcript, the extension's questions and the composer.
 *
 * The chat's own problems (a file rewritten elsewhere, an engine that stopped) are reported
 * to the app's status line rather than drawn here; the engine's notices, which are about a
 * turn, stay beside the transcript.
 */
export function Chat({ sessionId, place }: { sessionId: string; place: string | null }) {
	const conversation = useConversation({ place, sessionId });
	const { state } = conversation;

	useReportStatus("chat", chatReport(state), () => void conversation.reload());

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PaneBar
				title={state.title ?? "New chat"}
				meta={state.model}
				actions={
					state.busy ? (
						<Button variant="outline" size="sm" onClick={() => void conversation.abort()}>
							Stop
						</Button>
					) : undefined
				}
			/>
			{state.entries.length === 0 && state.streaming.length === 0 ? (
				<p className="flex flex-1 items-center justify-center p-6 text-meta text-muted-foreground">
					Opening the chat…
				</p>
			) : (
				<Transcript state={state} onLoadOlder={() => void conversation.loadOlder()} />
			)}
			<ChatNotices notices={state.notices} />
			<Composer
				busy={state.busy}
				writable={conversation.writable}
				onAbort={conversation.abort}
				onSend={conversation.send}
			/>
			<ConversationDialogs dialogs={state.dialogs} onAnswer={conversation.answer} />
		</div>
	);
}

/**
 * What the chat wants the status line to say: a file rewritten elsewhere first, because
 * the chat cannot continue; then the engine's own stop, in its own words.
 */
function chatReport(state: ConversationState): StatusValue | undefined {
	if (state.drift !== undefined) {
		return {
			action: "Reload",
			text: "This chat's file changed outside Epsilon. Reload to continue.",
			tone: "warning",
		};
	}
	const stopped = state.notices.findLast((notice) => notice.kind === "error");
	if (stopped !== undefined) return { text: stopped.text, tone: "warning" };
	return undefined;
}

/** The engine's last few notices: a compaction, a retry, an extension's warning. */
function ChatNotices({ notices }: { notices: ReadonlyArray<NoticeFrame> }) {
	const recent = notices.slice(-3);
	if (recent.length === 0) return null;
	return (
		<div className="grid gap-1 border-t px-page py-2">
			{recent.map((notice) => (
				<Notice
					key={notice.id}
					tone={notice.kind === "error" ? "error" : notice.kind === "warning" ? "warning" : "info"}
					title={notice.text}
				/>
			))}
		</div>
	);
}
