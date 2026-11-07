import { useNavigate } from "@tanstack/react-router";
import {
	FolderIcon,
	FolderMinusIcon,
	FolderOpenIcon,
	FolderUpIcon,
	MoreHorizontalIcon,
	PlusIcon,
	Settings2Icon,
	ShieldAlertIcon,
	ShieldCheckIcon,
	ShieldOffIcon,
} from "lucide-react";
import { useState } from "react";

import type { ProjectTrustAction } from "#protocol/settings/projects";
import { toneText } from "@/components/patterns/status/status-tone";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

import type { ProjectSessions, SessionSummary } from "./list.ts";
import { LoadMore, useLoadMore } from "./load-more";
import { SessionItem } from "./session-item";

/**
 * One project: its folder row, a new-chat action, a menu that reaches its
 * settings, and its chats underneath. Settings for a folder that is not trusted
 * yet would be refused, so the item says to trust it first.
 */
export function ProjectGroup({
	entry,
	activeId,
	expanded,
	onNewChat,
	onRemove,
	onRename,
	onPin,
	onDelete,
	onTrust,
}: {
	entry: ProjectSessions;
	activeId: string | undefined;
	/** A search is narrowing the list, so every surviving project shows its chats. */
	expanded: boolean;
	onNewChat: () => void;
	/** Takes the project off the list; the folder stays. */
	onRemove: () => void;
	onRename: (session: SessionSummary) => void;
	onPin: (session: SessionSummary) => void;
	onDelete: (session: SessionSummary) => void;
	/** Trust, revoke, forget or trust the parent of this folder. */
	onTrust: (action: ProjectTrustAction) => void;
}) {
	const navigate = useNavigate();
	const { project, sessions } = entry;
	const [chatLimit, moreChats] = useLoadMore();
	const shownSessions = expanded ? sessions : sessions.slice(0, chatLimit);
	const holdsActive = sessions.some((session) => session.id === activeId);
	const canTrust = !project.trusted;
	const canTrustParent = !project.trusted && project.parent !== null;
	const canRevoke = project.trusted && project.hasProjectResources;
	const canForget = project.trusted && project.decidedHere;
	const hasTrustActions = canTrust || canTrustParent || canRevoke || canForget;
	// Controlled from the first render: an uncontrolled default that changes after
	// mount makes Base UI warn, and the user's own toggle must keep working.
	const [open, setOpen] = useState(holdsActive);
	const shown = expanded || open;
	/** One lucide folder, open or closed; switching it remounts and plays the fade. */
	const Folder = shown ? FolderOpenIcon : FolderIcon;
	/** Project actions stay on the row surface, out of the way until it is hovered or focused. */
	const rowAction =
		"absolute top-1/2 -translate-y-1/2 text-muted-foreground transition duration-fast md:translate-x-1 md:opacity-0 md:group-hover/project:translate-x-0 md:group-hover/project:opacity-100 md:focus-visible:translate-x-0 md:focus-visible:opacity-100 md:data-[popup-open]:translate-x-0 md:data-[popup-open]:opacity-100";
	return (
		<Collapsible
			open={expanded ? true : open}
			onOpenChange={(next) => {
				if (!expanded) setOpen(next);
			}}
			render={<SidebarMenuItem className="animate-enter-rise" />}
		>
			<div className="group/project relative rounded-chip hover:bg-sidebar-accent">
				<CollapsibleTrigger
					render={
						<SidebarMenuButton className="min-w-0 gap-1.5 hover:bg-transparent active:bg-transparent" />
					}
				>
					<Folder className="size-icon shrink-0 animate-enter-fade text-muted-foreground" />
					<span className="truncate">{project.name}</span>
					{!project.trusted && (
						<Tip label="Not trusted yet">
							<ShieldAlertIcon
								aria-label="Not trusted"
								className={toneText("warning", "size-icon shrink-0")}
							/>
						</Tip>
					)}
					{/* The actions sit on the row: this keeps a long name out from under them. */}
					<span aria-hidden className="w-12 shrink-0" />
				</CollapsibleTrigger>
				<Tip label={`New chat in ${project.name}`}>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`New chat in ${project.name}`}
						className={`${rowAction} right-9`}
						onClick={onNewChat}
					>
						<PlusIcon />
					</Button>
				</Tip>
				<DropdownMenu>
					<Tip label={`${project.name} actions`}>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`${project.name} actions`}
									className={`${rowAction} right-1`}
								/>
							}
						>
							<MoreHorizontalIcon />
						</DropdownMenuTrigger>
					</Tip>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={onNewChat}>
								<PlusIcon />
								New chat
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!project.trusted}
								onClick={() => void navigate({ to: "/settings/projects" })}
							>
								<Settings2Icon />
								{project.trusted ? "Project settings" : "Project settings (trust it first)"}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						{hasTrustActions && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{canTrust && (
										<DropdownMenuItem onClick={() => onTrust("trust")}>
											<ShieldCheckIcon />
											Trust folder
										</DropdownMenuItem>
									)}
									{canTrustParent && (
										<DropdownMenuItem onClick={() => onTrust("trust-parent")}>
											<FolderUpIcon />
											Trust parent folder
										</DropdownMenuItem>
									)}
									{canRevoke && (
										<DropdownMenuItem variant="destructive" onClick={() => onTrust("untrust")}>
											<ShieldAlertIcon />
											Revoke trust
										</DropdownMenuItem>
									)}
									{canForget && (
										<DropdownMenuItem onClick={() => onTrust("forget")}>
											<ShieldOffIcon />
											Forget trust decision
										</DropdownMenuItem>
									)}
								</DropdownMenuGroup>
							</>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onRemove}>
							<FolderMinusIcon />
							Remove from Epsilon
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-base data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
				<SidebarMenu className="ml-3 w-auto pl-2">
					{shownSessions.map((session) => (
						<SessionItem
							key={session.id}
							session={session}
							project={project.path}
							active={session.id === activeId}
							onRename={onRename}
							onPin={onPin}
							onDelete={onDelete}
						/>
					))}
					{!expanded && sessions.length > shownSessions.length && (
						<LoadMore
							label={`Load more chats in ${project.name}`}
							text="Load more chats"
							onClick={moreChats}
						/>
					)}
				</SidebarMenu>
			</CollapsibleContent>
		</Collapsible>
	);
}
