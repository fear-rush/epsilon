/**
 * One session row: the title, when it last changed, the live badges, and the
 * actions every row has.
 */
import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon } from "lucide-react";

import { Tip } from "@/components/patterns/tip";
import { Badge } from "@/components/ui/badge";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { formatWhen, sessionLabel } from "@/features/sessions/format";
import type { SessionSummary } from "@/api/types";

type SessionItemProps = {
	session: SessionSummary;
	/** The project folder, for a session that runs in one; it goes through the trust gate. */
	project?: string;
	active: boolean;
	/** A chat that just arrived in the list gets the slide-in entrance. */
	animate?: boolean;
	onRename: (session: SessionSummary) => void;
	onPin: (session: SessionSummary) => void;
	onDelete: (session: SessionSummary) => void;
};

export function SessionItem({
	session,
	project,
	active,
	animate = false,
	onRename,
	onPin,
	onDelete,
}: SessionItemProps) {
	const { isMobile, setOpenMobile } = useSidebar();

	const closeOnNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<SidebarMenuItem
						className={animate ? "chat-row-enter" : undefined}
						style={{ viewTransitionName: `chat-${session.id}` }}
					/>
				}
			>
				<SidebarMenuButton
					isActive={active}
					render={
						<Link
							to="/sessions/$sessionId"
							params={{ sessionId: session.id }}
							search={{ project }}
							onClick={closeOnNavigate}
						/>
					}
					className="h-auto flex-col items-start gap-row py-1.5"
				>
					<span className="flex w-full items-center gap-1.5">
						{session.pinned && (
							<PinIcon className="shrink-0 text-muted-foreground" aria-label="Pinned" />
						)}
						<span className="truncate">{sessionLabel(session)}</span>
					</span>
					<span className="flex w-full items-center gap-1.5 text-meta font-normal text-muted-foreground">
						<span className="truncate">{formatWhen(session.modified)}</span>
						{session.needsInput && <Badge variant="warning">needs input</Badge>}
					</span>
				</SidebarMenuButton>

				<DropdownMenu>
					<Tip label="Chat actions">
						<DropdownMenuTrigger
							render={
								<SidebarMenuAction aria-label="Chat actions" className="text-muted-foreground" />
							}
						>
							<MoreHorizontalIcon />
						</DropdownMenuTrigger>
					</Tip>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => onRename(session)}>
								<PencilIcon />
								Rename chat
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onPin(session)}>
								{session.pinned ? <PinOffIcon /> : <PinIcon />}
								{session.pinned ? "Unpin chat" : "Pin chat"}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
								Delete chat
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuItem onClick={() => onRename(session)}>
						<PencilIcon />
						Rename chat
					</ContextMenuItem>
					<ContextMenuItem onClick={() => onPin(session)}>
						{session.pinned ? <PinOffIcon /> : <PinIcon />}
						{session.pinned ? "Unpin chat" : "Pin chat"}
					</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuItem variant="destructive" onClick={() => onDelete(session)}>
						Delete chat
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	);
}
