import { useNavigate } from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	GitBranchIcon,
	SearchIcon,
	SlidersHorizontalIcon,
	XIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { transcript } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { Notice as NoticeFrame } from "#protocol/conversation/frames";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportStatus } from "@/status";

import { Composer } from "./composer";
import { ConversationDialogs } from "./dialogs";
import { ProjectGate } from "./project-gate";
import { Transcript, matchingRowIds } from "./transcript";
import type { Jump } from "./transcript";
import { useConversation } from "./use-conversation";
import { ConversationWelcome } from "./welcome";

/** Both dialogs are read-only until they are opened, so neither ships with the chat. */
const SessionControls = lazy(() =>
	import("./session-controls").then((module) => ({ default: module.SessionControls })),
);
const TreeDialog = lazy(() =>
	import("./tree-dialog").then((module) => ({ default: module.TreeDialog })),
);

/**
 * One chat route. A new chat in a project folder passes through the trust gate first,
 * because Epsilon starts no engine before the folder's answer exists.
 */
export function Chat({ sessionId, place }: { sessionId: string; place: string | null }) {
	if (place === null) return <Conversation place={null} sessionId={sessionId} />;
	return (
		<ProjectGate folder={place}>
			<Conversation place={place} sessionId={sessionId} />
		</ProjectGate>
	);
}

/**
 * One chat: the bar, the transcript, an in-chat search, the extension's questions and the
 * composer.
 *
 * The chat's own problems (a file rewritten elsewhere, an engine that stopped) are reported
 * to the app's status line rather than drawn here; the engine's notices, which are about a
 * turn, stay beside the transcript.
 */
function Conversation({ sessionId, place }: { sessionId: string; place: string | null }) {
	const conversation = useConversation({ place, sessionId });
	const { state } = conversation;
	const navigate = useNavigate();

	// A fork writes a new file and a new id. The old id is only an alias while the engine
	// lives, so the page moves to the id the file now carries.
	useEffect(() => {
		if (state.sessionId === undefined || state.sessionId === sessionId) return;
		void navigate({
			params: { sessionId: state.sessionId },
			replace: true,
			search: place === null ? {} : { project: place },
			to: "/sessions/$sessionId",
		});
	}, [state.sessionId, sessionId, navigate, place]);

	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const [jumpNonce, setJumpNonce] = useState(0);
	const [anchorFrom, setAnchorFrom] = useState<number | undefined>(undefined);
	const [controlsOpen, setControlsOpen] = useState(false);
	const [treeOpen, setTreeOpen] = useState(false);

	const matches = searching ? matchingRowIds(transcript(state), query) : [];
	const jumpId = matches[cursor];
	const jump: Jump | undefined =
		jumpId === undefined ? undefined : { id: jumpId, nonce: jumpNonce };

	const send = async (text: string): Promise<void> => {
		await conversation.send(text);
		// The sent message scrolls to the top of the view; the reply grows below it (R9).
		setAnchorFrom(transcript(state).length);
	};

	const step = (by: 1 | -1): void => {
		if (matches.length === 0) return;
		setCursor((current) => (current + by + matches.length) % matches.length);
		setJumpNonce((current) => current + 1);
	};

	useReportStatus("chat", chatReport(state), () => void conversation.reload());

	const empty = state.entries.length === 0 && state.streaming.length === 0;
	const composer = (
		<Composer
			busy={state.busy}
			draft={state.draft}
			sessionId={sessionId}
			writable={conversation.writable}
			onAbort={conversation.abort}
			onSend={send}
		/>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PaneBar
				title={state.title ?? "New chat"}
				meta={
					state.model === undefined
						? undefined
						: state.thinking === undefined
							? state.model
							: `${state.model} · ${state.thinking}`
				}
				actions={
					<div className="flex items-center gap-2">
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Branch tree"
							onClick={() => setTreeOpen(true)}
						>
							<GitBranchIcon />
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Session settings"
							onClick={() => setControlsOpen(true)}
						>
							<SlidersHorizontalIcon />
						</Button>
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
			{conversation.loaded ? (
				empty ? (
					// A conversation opens on the box that starts it, not a card above a footer.
					<ConversationWelcome
						composer={composer}
						place={place === null ? "chat" : "project"}
						status={<ChatNotices notices={state.notices} />}
					/>
				) : (
					<>
						<Transcript
							state={state}
							onLoadOlder={() => void conversation.loadOlder()}
							anchorFrom={anchorFrom}
							onAnchored={() => setAnchorFrom(undefined)}
							jump={jump}
							toolOpen={conversation.toolOpen}
							onToggleTool={conversation.toggleTool}
						/>
						<ChatNotices notices={state.notices} />
						<div className="animate-enter-rise">{composer}</div>
					</>
				)
			) : (
				// The engine is still starting; an empty transcript would be a lie.
				<div className="flex min-h-0 flex-1 animate-enter-rise items-center justify-center">
					<LoadingState label="Loading the session…" />
				</div>
			)}
			<ConversationDialogs dialogs={state.dialogs} onAnswer={conversation.answer} />
			<Suspense fallback={null}>
				{controlsOpen && (
					<SessionControls conversation={conversation} onClose={() => setControlsOpen(false)} />
				)}
				{treeOpen && <TreeDialog conversation={conversation} onClose={() => setTreeOpen(false)} />}
			</Suspense>
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
