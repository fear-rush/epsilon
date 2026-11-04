import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { transcript } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { Notice as NoticeFrame } from "#protocol/conversation/frames";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportStatus } from "@/status";

import { Composer } from "./composer";
import { ConversationDialogs } from "./dialogs";
import { Transcript, matchingRowIds } from "./transcript";
import type { Jump } from "./transcript";
import { useConversation } from "./use-conversation";

/**
 * One chat: the bar, the transcript, an in-chat search, the extension's questions and the
 * composer.
 *
 * The chat's own problems (a file rewritten elsewhere, an engine that stopped) are reported
 * to the app's status line rather than drawn here; the engine's notices, which are about a
 * turn, stay beside the transcript.
 */
export function Chat({ sessionId, place }: { sessionId: string; place: string | null }) {
	const conversation = useConversation({ place, sessionId });
	const { state } = conversation;

	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const [jumpNonce, setJumpNonce] = useState(0);
	const [anchorFrom, setAnchorFrom] = useState<number | undefined>(undefined);

	const matches = useMemo(
		() => (searching ? matchingRowIds(transcript(state), query) : []),
		[searching, state, query],
	);
	const jumpId = matches[cursor];
	const jump = useMemo<Jump | undefined>(
		() => (jumpId === undefined ? undefined : { id: jumpId, nonce: jumpNonce }),
		[jumpId, jumpNonce],
	);

	const send = useCallback(
		async (text: string) => {
			await conversation.send(text);
			// The sent message scrolls to the top of the view; the reply grows below it (R9).
			setAnchorFrom(transcript(state).length);
		},
		[conversation, state],
	);

	const step = (by: 1 | -1): void => {
		if (matches.length === 0) return;
		setCursor((current) => (current + by + matches.length) % matches.length);
		setJumpNonce((current) => current + 1);
	};

	useReportStatus("chat", chatReport(state), () => void conversation.reload());

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PaneBar
				title={state.title ?? "New chat"}
				meta={state.model}
				actions={
					<div className="flex items-center gap-2">
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Search conversation"
							onClick={() => setSearching((open) => !open)}
						>
							<SearchIcon />
						</Button>
						{state.busy && (
							<Button variant="outline" size="sm" onClick={() => void conversation.abort()}>
								Stop
							</Button>
						)}
					</div>
				}
			/>
			{searching && (
				<div className="flex items-center gap-2 border-b px-page py-2">
					<Input
						aria-label="Find in conversation"
						placeholder="Find in conversation"
						className="max-w-sm"
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setCursor(0);
							setJumpNonce((current) => current + 1);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
						}}
					/>
					<span className="text-meta text-muted-foreground">
						{query.trim() === ""
							? "Type to search"
							: matches.length === 0
								? "No match"
								: `${cursor + 1} of ${matches.length}`}
					</span>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Previous match"
						disabled={matches.length < 2}
						onClick={() => step(-1)}
					>
						<ChevronUpIcon />
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Next match"
						disabled={matches.length < 2}
						onClick={() => step(1)}
					>
						<ChevronDownIcon />
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Close search"
						onClick={() => {
							setSearching(false);
							setQuery("");
						}}
					>
						<XIcon />
					</Button>
				</div>
			)}
			{state.entries.length === 0 && state.streaming.length === 0 ? (
				<p className="flex flex-1 items-center justify-center p-6 text-meta text-muted-foreground">
					Opening the chat…
				</p>
			) : (
				<Transcript
					state={state}
					onLoadOlder={() => void conversation.loadOlder()}
					anchorFrom={anchorFrom}
					onAnchored={() => setAnchorFrom(undefined)}
					jump={jump}
					toolOpen={conversation.toolOpen}
					onToggleTool={conversation.toggleTool}
				/>
			)}
			<ChatNotices notices={state.notices} />
			<Composer
				busy={state.busy}
				writable={conversation.writable}
				onAbort={conversation.abort}
				onSend={send}
			/>
			<ConversationDialogs dialogs={state.dialogs} onAnswer={conversation.answer} />
		</div>
	);
}

/**
 * What the chat wants the status line to say: a file rewritten elsewhere first, because
 * the chat cannot continue; then the engine's own stop, in its own words.
 */
function chatReport(state: ConversationState) {
	if (state.drift !== undefined) {
		return {
			action: "Reload",
			text: "This chat's file changed outside Epsilon. Reload to continue.",
			tone: "warning" as const,
		};
	}
	const stopped = state.notices.findLast((notice) => notice.kind === "error");
	if (stopped !== undefined) return { text: stopped.text, tone: "warning" as const };
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
