/**
 * The session's title, where it runs, and what can be done with it from here. A chat can
 * move into a project: pi forks its history into the project folder and the chat's own
 * file goes, so the conversation continues there under a new id.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, MoreHorizontalIcon } from "lucide-react";
import { memo, useState } from "react";
import type { ReactNode } from "react";

import { LoadingState } from "@/components/patterns/status/loading-state";
import { Tip } from "@/components/patterns/tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { call } from "@/core/runtime";
import { FolderDialog } from "@/features/projects";
import { useRecentProjects } from "@/features/sessions";
import { cn } from "@/lib/cn";

import { ChatBar } from "./chat-bar";
import { SessionControls } from "./session-controls";
import type { Conversation } from "./use-conversation";

const folderName = (path: string): string =>
	path.split("/").findLast((part) => part !== "") ?? path;

/**
 * Where the conversation runs, above the composer. A chat needs no line: its folder is
 * Epsilon's own and says nothing. A project names the folder it works in.
 */
export function ComposerPlace({ path, onChange }: { path: string; onChange?: () => void }) {
	const content = (
		<>
			<FolderIcon className="size-4 shrink-0" />
			<span className="truncate font-medium text-foreground">{folderName(path)}</span>
			<span className="truncate">{path}</span>
		</>
	);
	const className = "flex min-w-0 items-center gap-2 px-2 text-meta text-muted-foreground";
	if (onChange === undefined) {
		return <div className={className}>{content}</div>;
	}
	return (
		<button
			type="button"
			className={cn(className, "w-full rounded-md py-1 text-left hover:bg-muted")}
			onClick={onChange}
		>
			{content}
			<span className="ml-auto shrink-0 pl-2">Change</span>
		</button>
	);
}

/** The same folder in the chat's bar, short enough for a phone. */
export function PlaceBadge({ path }: { path: string }) {
	return (
		<Badge variant="secondary">
			<FolderIcon data-icon="inline-start" />
			{folderName(path)}
		</Badge>
	);
}

/**
 * What a session shows before its snapshot: the engine starting. An engine that did not
 * start is the status line's (a chat's own trouble is reported there), so the pane only
 * waits. The home page uses this too, so a new chat cannot spin in silence.
 */
export function SessionLoader() {
	return (
		<div className="flex min-h-0 flex-1 animate-enter-rise items-center justify-center">
			<LoadingState label="Loading the session…" />
		</div>
	);
}

function SessionHeaderImpl({
	sessionId,
	conversation,
	title,
	place,
	busy,
	empty,
	autoCompaction,
	autoRetry,
	hideThinkingBlock,
	isCompacting,
	blocked,
	cloning,
	onTree,
	onFork,
	onClone,
	actions,
}: {
	sessionId: string;
	conversation: Conversation;
	title?: string | undefined;
	/** The project this chat runs in, or null for Epsilon's own chat folder. */
	place: string | null;
	busy: boolean;
	/** A chat with no file has nothing to export, fork, clone or move yet. */
	empty: boolean;
	autoCompaction: boolean;
	autoRetry: boolean;
	hideThinkingBlock: boolean;
	isCompacting: boolean;
	/** Why branch actions are refused right now; undefined when they are possible. */
	blocked: string | undefined;
	cloning: boolean;
	onTree: () => void;
	onFork: () => void;
	onClone: () => void;
	/** The branch's own controls until they have a home in main's header. */
	actions?: ReactNode;
}) {
	const [moving, setMoving] = useState(false);

	return (
		<>
			<ChatBar
				title={title}
				actions={
					<>
						<div className="flex items-center gap-2">
							{place !== null && <PlaceBadge path={place} />}
							<SessionControls
								autoCompaction={autoCompaction}
								autoRetry={autoRetry}
								blocked={blocked}
								cloning={cloning}
								conversation={conversation}
								empty={empty}
								hideThinkingBlock={hideThinkingBlock}
								isCompacting={isCompacting}
								onClone={onClone}
								onFork={onFork}
								onTree={onTree}
							/>
							{place === null && (
								<DropdownMenu>
									<Tip label="Chat actions">
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Chat actions"
													className="text-muted-foreground"
												/>
											}
										>
											<MoreHorizontalIcon />
										</DropdownMenuTrigger>
									</Tip>
									<DropdownMenuContent align="end">
										<DropdownMenuGroup>
											<DropdownMenuItem disabled={busy || empty} onClick={() => setMoving(true)}>
												<FolderIcon />
												Move to project…
											</DropdownMenuItem>
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{actions}
						</div>
					</>
				}
			/>
			{place === null && moving && (
				<MoveChatDialog sessionId={sessionId} onClose={() => setMoving(false)} />
			)}
		</>
	);
}

/** Mounted only while the picker is open, so the recent list costs nothing on a page view. */
function MoveChatDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const recent = useRecentProjects();
	return (
		<FolderDialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Move this chat to a project"
			action="Move"
			recent={recent}
			onPick={async (path) => {
				const moved = await call((client) =>
					client["sessions.move"]({ sessionId, toDirectory: path }),
				);
				await queryClient.invalidateQueries({ queryKey: ["sessions"] });
				await navigate({
					to: "/sessions/$sessionId",
					params: { sessionId: moved.sessionId },
					search: { project: path },
				});
			}}
		/>
	);
}

/** Its props are stable during a stream, so a token does not redraw the header. */
export const SessionHeader = memo(SessionHeaderImpl);
