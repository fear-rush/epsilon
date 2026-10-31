/**
 * The session's title, where it runs, and what can be done with it from here. A
 * chat can move into a project: pi forks its history into the project folder and
 * the chat's own file goes, so the conversation continues there under a new id.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, MoreHorizontalIcon } from "lucide-react";
import { memo, useState } from "react";
import { cn } from "@/lib/cn";
import type { Place } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessionKeys } from "@/api/keys";
import { moveSession } from "@/api/endpoints";
import { Tip } from "@/components/patterns/tip";
import { ChatBar } from "@/features/conversation/chat-bar";
import { SessionControls } from "@/features/conversation/session-controls";
import type { ConversationStore } from "@/features/conversation/store";
import { FolderDialog, useRecentProjects } from "@/features/projects";

const folderName = (path: string): string => path.split("/").filter(Boolean).at(-1) ?? path;

/**
 * Where the conversation runs, under the composer. A chat needs no line: its folder is
 * Epsilon's own and says nothing. A project names the folder it works in, and can open
 * the picker again when the page has a project to change.
 */
export function ComposerPlace({ place, onChange }: { place: Place; onChange?: () => void }) {
	if (place.kind === "chat") return null;
	const content = (
		<>
			<FolderIcon className="size-4 shrink-0" />
			<span className="truncate font-medium text-foreground">{folderName(place.path)}</span>
			<span className="truncate">{place.path}</span>
		</>
	);
	const className = "flex min-w-0 items-center gap-2 border-t px-1 text-meta text-muted-foreground";
	if (onChange === undefined) {
		return <div className={cn(className, "pt-2")}>{content}</div>;
	}
	return (
		<button
			type="button"
			className={cn(className, "w-full rounded-md py-2 text-left hover:bg-muted")}
			onClick={onChange}
		>
			{content}
			<span className="ml-auto shrink-0 pl-2">Change</span>
		</button>
	);
}

function PlaceBadge({ place }: { place: Place }) {
	if (place.kind === "chat") return null;
	return (
		<Badge variant="secondary">
			<FolderIcon data-icon="inline-start" />
			{folderName(place.path)}
		</Badge>
	);
}

function SessionHeaderImpl({
	sessionId,
	store,
	title,
	place,
	busy,
	empty,
	autoCompaction,
	autoRetry,
	isCompacting,
}: {
	sessionId: string;
	store: ConversationStore;
	title?: string;
	place: Place;
	busy: boolean;
	/** A chat with no messages has no file yet, so there is nothing to move. */
	empty: boolean;
	autoCompaction: boolean;
	autoRetry: boolean;
	isCompacting: boolean;
}) {
	const [moving, setMoving] = useState(false);

	const hasTitle = title !== undefined && title !== "";
	return (
		<>
			<ChatBar
				title={hasTitle ? title : undefined}
				actions={
					<>
						<PlaceBadge place={place} />
						<SessionControls
							store={store}
							autoCompaction={autoCompaction}
							autoRetry={autoRetry}
							isCompacting={isCompacting}
						/>
						{place.kind === "chat" && (
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
					</>
				}
			/>
			{place.kind === "chat" && moving && (
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
				const id = await moveSession(sessionId, path);
				await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
				await navigate({
					to: "/sessions/$sessionId",
					params: { sessionId: id },
					search: { project: path },
				});
			}}
		/>
	);
}

/** Its props are stable during a stream, so a token does not redraw the header. */
export const SessionHeader = memo(SessionHeaderImpl);
