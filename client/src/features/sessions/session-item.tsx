/**
 * One session row: the title, when it last changed, the live badges, and the
 * actions every row has (docs/ui.md, Concept to component).
 */
import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { formatWhen, sessionLabel } from "@/lib/format";
import type { SessionSummary } from "@/api/types";

type SessionItemProps = {
	session: SessionSummary;
	active: boolean;
	onDelete: (session: SessionSummary) => void;
};

export function SessionItem({ session, active, onDelete }: SessionItemProps) {
	const { isMobile, setOpenMobile } = useSidebar();

	const closeOnNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger render={<SidebarMenuItem />}>
				<SidebarMenuButton
					isActive={active}
					render={
						<Link
							to="/sessions/$sessionId"
							params={{ sessionId: session.id }}
							onClick={closeOnNavigate}
						/>
					}
					className="h-auto flex-col items-start gap-0.5 py-1.5 pr-9"
				>
					<span className="w-full truncate">{sessionLabel(session)}</span>
					<span className="flex w-full items-center gap-1.5 text-xs font-normal text-muted-foreground">
						<span className="truncate">{formatWhen(session.modified)}</span>
						<span className="shrink-0">{session.messageCount} messages</span>
						{session.needsInput && <Badge variant="warning">needs input</Badge>}
					</span>
				</SidebarMenuButton>

				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Session actions"
								className="absolute top-2 right-1.5 text-muted-foreground"
							/>
						}
					>
						<MoreHorizontalIcon />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
								Delete session
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuItem variant="destructive" onClick={() => onDelete(session)}>
						Delete session
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	);
}
