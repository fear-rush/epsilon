/**
 * The sidebar: chats, then projects with their chats. pi owns the files; this
 * polls the REST route for the live badges and deletes through the same route,
 * confirming first. A project appears here once it has a chat on disk. The
 * section actions start a new chat and open a project. Connection problems are
 * the app banner's, not this column's.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import {
	ChevronRightIcon,
	FolderIcon,
	FolderMinusIcon,
	FolderPlusIcon,
	MessageSquareIcon,
	MoreHorizontalIcon,
	PlusIcon,
	Settings2Icon,
	ShieldAlertIcon,
	SquarePenIcon,
} from "lucide-react";
import { useState } from "react";

import { SessionItem } from "@/features/sessions/session-item";
import { RenameDialog } from "@/features/sessions/rename-dialog";
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
import { Separator } from "@/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { errorView } from "@/components/patterns/status/error-view";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { SidebarAccount } from "@/features/sessions/sidebar-account";
import { DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { FolderDialog } from "@/features/projects";
import { sessionKeys } from "@/api/keys";
import {
	deleteSession,
	fetchSessions,
	removeProject,
	renameSession,
	setSessionPinned,
} from "@/api/endpoints";
import { sessionLabel } from "@/features/sessions/format";
import type { ProjectSessions, SessionList, SessionSummary } from "@/api/types";

/** Live children come and go outside this tab, so the badges poll. */
const LIVE_REFRESH_MS = 5_000;
/** A row modified this close to the last poll is a chat that just arrived. */
const FRESH_SESSION_MS = 10_000;

/** The same order the list route uses: pinned first, then newest. */
const sortChats = (sessions: SessionSummary[]): SessionSummary[] =>
	[...sessions].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.modified.localeCompare(a.modified);
	});

const pinnedList = (list: SessionList, id: string, pinned: boolean): SessionList => ({
	...list,
	chats: sortChats(list.chats.map((chat) => (chat.id === id ? { ...chat, pinned } : chat))),
	projects: list.projects.map((entry) => ({
		...entry,
		sessions: sortChats(
			entry.sessions.map((chat) => (chat.id === id ? { ...chat, pinned } : chat)),
		),
	})),
});

/** Reorder inside one view transition; the unsupported path still applies the change. */
const applyViewTransition = (update: () => void): void => {
	if (document.startViewTransition === undefined) {
		update();
		return;
	}
	document.startViewTransition(() => flushSync(update));
};

export function SessionSidebar() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const queryClient = useQueryClient();
	const { isMobile, setOpenMobile } = useSidebar();
	const [pendingDelete, setPendingDelete] = useState<SessionSummary | undefined>(undefined);
	const [pendingProject, setPendingProject] = useState<ProjectSessions | undefined>(undefined);
	const [renaming, setRenaming] = useState<SessionSummary | undefined>(undefined);
	const [renameOpen, setRenameOpen] = useState(false);
	const [opening, setOpening] = useState(false);
	const sessions = useQuery({
		queryKey: sessionKeys.all,
		queryFn: ({ signal }) => fetchSessions(signal),
		refetchInterval: LIVE_REFRESH_MS,
	});
	const remove = useMutation({
		mutationFn: deleteSession,
		onSuccess: async (_done, id) => {
			setPendingDelete(undefined);
			// The open chat is gone; leave its page instead of reattaching to nothing.
			if (id === activeId) void navigate({ to: "/", search: {} });
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});
	const forgetProject = useMutation({
		mutationFn: (entry: ProjectSessions) => removeProject(entry.project.path),
		onSuccess: async (_removed, entry) => {
			setPendingProject(undefined);
			if (entry.sessions.some((session) => session.id === activeId)) {
				void navigate({ to: "/", search: {} });
			}
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});
	const renameChat = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) => renameSession(id, name),
		onSuccess: async () => {
			setRenameOpen(false);
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});
	const pinChat = useMutation({
		mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => setSessionPinned(id, pinned),
		onMutate: async ({ id, pinned }) => {
			await queryClient.cancelQueries({ queryKey: sessionKeys.all });
			const previous = queryClient.getQueryData<SessionList>(sessionKeys.all);
			if (previous !== undefined) {
				const next = pinnedList(previous, id, pinned);
				applyViewTransition(() => queryClient.setQueryData(sessionKeys.all, next));
			}
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous !== undefined) {
				const previous = context.previous;
				applyViewTransition(() => queryClient.setQueryData(sessionKeys.all, previous));
			}
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});

	/** A new chat already in a project folder. */
	const startProjectChat = (project: string): void => {
		if (isMobile) setOpenMobile(false);
		void navigate({
			to: "/sessions/$sessionId",
			params: { sessionId: crypto.randomUUID() },
			search: { project },
		});
	};
	/** The home page is the new-chat screen, in its default chat mode. */
	const newChat = (): void => {
		if (isMobile) setOpenMobile(false);
		void navigate({ to: "/", search: {} });
	};
	const matched = matchRoute({ to: "/sessions/$sessionId" });
	const activeId = matched === false ? undefined : matched.sessionId;
	const onDelete = (session: SessionSummary) => {
		remove.reset();
		setPendingDelete(session);
	};
	const onRename = (session: SessionSummary) => {
		renameChat.reset();
		setRenaming(session);
		setRenameOpen(true);
	};
	const onPin = (session: SessionSummary) => {
		pinChat.reset();
		pinChat.mutate({ id: session.id, pinned: !session.pinned });
	};
	const projects = sessions.data?.projects ?? [];
	const freshAfter = sessions.dataUpdatedAt - FRESH_SESSION_MS;
	const isFresh = (session: SessionSummary): boolean => Date.parse(session.modified) >= freshAfter;

	return (
		<Sidebar className="h-full animate-enter-left">
			<PaneBar
				title="epsilon"
				className="animate-enter-fade"
				actions={
					!isMobile && (
						<Tip label="Hide sidebar">
							<SidebarTrigger />
						</Tip>
					)
				}
			/>

			<SidebarContent>
				{sessions.isPending ? (
					<div className="animate-enter-rise pad-item">
						<LoadingState label="Loading chats…" />
					</div>
				) : sessions.isError ? (
					<StatusView {...errorView(sessions.error)} />
				) : (
					<>
						<SidebarGroup className="animate-enter-rise">
							<SidebarGroupLabel>Projects</SidebarGroupLabel>
							<Tip label="Open project">
								<SidebarGroupAction
									aria-label="Open project"
									className="text-muted-foreground"
									onClick={() => setOpening(true)}
								>
									<FolderPlusIcon />
								</SidebarGroupAction>
							</Tip>
							<SidebarGroupContent>
								<SidebarMenu>
									{projects.map((entry) => (
										<ProjectGroup
											key={entry.project.path}
											entry={entry}
											activeId={activeId}
											isFresh={isFresh}
											onNewChat={() => startProjectChat(entry.project.path)}
											onRemove={() => {
												forgetProject.reset();
												setPendingProject(entry);
											}}
											onRename={onRename}
											onPin={onPin}
											onDelete={onDelete}
										/>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>

						<SidebarGroup className="animate-enter-rise">
							<SidebarGroupLabel>Chats</SidebarGroupLabel>
							<Tip label="New chat">
								<SidebarGroupAction
									aria-label="New chat"
									className="text-muted-foreground"
									onClick={newChat}
								>
									<SquarePenIcon />
								</SidebarGroupAction>
							</Tip>
							<SidebarGroupContent>
								{sessions.data.chats.length === 0 ? (
									<div className="px-2">
										<InlineStatus icon={MessageSquareIcon}>No chats yet</InlineStatus>
									</div>
								) : (
									<SidebarMenu>
										{sessions.data.chats.map((session) => (
											<SessionItem
												key={session.id}
												session={session}
												active={session.id === activeId}
												animate={isFresh(session)}
												onRename={onRename}
												onPin={onPin}
												onDelete={onDelete}
											/>
										))}
									</SidebarMenu>
								)}
							</SidebarGroupContent>
						</SidebarGroup>
					</>
				)}
				{sessions.data?.pinsProblem !== undefined && (
					<div className="px-pane">
						<Notice tone="error">{sessions.data.pinsProblem}</Notice>
					</div>
				)}
			</SidebarContent>

			{pinChat.error !== null && (
				<div className="animate-enter-rise px-pane pb-pane">
					<Notice tone="error">{pinChat.error.message}</Notice>
				</div>
			)}

			<Separator className="bg-sidebar-border" />
			<SidebarFooter className="animate-enter-rise">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarAccount />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<FolderDialog
				open={opening}
				onOpenChange={setOpening}
				title="Open a project"
				action="Open"
				recent={projects.map((entry) => entry.project)}
				onPick={(path) => startProjectChat(path)}
			/>

			<RenameDialog
				open={renameOpen}
				session={renaming}
				pending={renameChat.isPending}
				error={renameChat.error}
				onOpenChange={setRenameOpen}
				onRename={(name) => {
					if (renaming !== undefined) renameChat.mutate({ id: renaming.id, name });
				}}
			/>

			<DeleteDialog
				open={pendingDelete !== undefined}
				title="Delete this chat?"
				description={
					pendingDelete === undefined
						? ""
						: `${sessionLabel(pendingDelete)} is removed from pi's list and its file is deleted.`
				}
				error={remove.error}
				pending={remove.isPending}
				confirmLabel="Delete"
				onOpenChange={(open) => {
					if (!open) {
						remove.reset();
						setPendingDelete(undefined);
					}
				}}
				onConfirm={() => {
					if (pendingDelete !== undefined) remove.mutate(pendingDelete.id);
				}}
			/>

			<DeleteDialog
				open={pendingProject !== undefined}
				title={`Remove ${pendingProject?.project.name ?? "this project"} from Epsilon?`}
				description={
					pendingProject === undefined
						? ""
						: `Its ${pendingProject.sessions.length === 1 ? "chat is" : `${pendingProject.sessions.length} chats are`} deleted from pi's history. The folder ${pendingProject.project.path} and its files stay where they are, and opening it again starts fresh.`
				}
				error={forgetProject.error}
				pending={forgetProject.isPending}
				confirmLabel="Remove"
				onOpenChange={(open) => {
					if (!open) {
						forgetProject.reset();
						setPendingProject(undefined);
					}
				}}
				onConfirm={() => {
					if (pendingProject !== undefined) forgetProject.mutate(pendingProject);
				}}
			/>
		</Sidebar>
	);
}

/**
 * One project: its folder row, a new-chat action, a menu that reaches its
 * settings, and its chats underneath. Settings for a folder that is not trusted
 * yet would be refused, so the item says to trust it first.
 */
function ProjectGroup({
	entry,
	activeId,
	isFresh,
	onNewChat,
	onRemove,
	onRename,
	onPin,
	onDelete,
}: {
	entry: ProjectSessions;
	activeId: string | undefined;
	isFresh: (session: SessionSummary) => boolean;
	onNewChat: () => void;
	/** Takes the project off the list; the folder stays. */
	onRemove: () => void;
	onRename: (session: SessionSummary) => void;
	onPin: (session: SessionSummary) => void;
	onDelete: (session: SessionSummary) => void;
}) {
	const navigate = useNavigate();
	const { project, sessions } = entry;
	const holdsActive = sessions.some((session) => session.id === activeId);
	// Controlled from the first render: an uncontrolled default that changes after
	// mount makes Base UI warn, and the user's own toggle must keep working.
	const [open, setOpen] = useState(holdsActive);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			render={<SidebarMenuItem className="animate-enter-rise" />}
		>
			<div className="group/project flex items-center gap-1">
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&[data-panel-open]>svg:first-child]:rotate-90">
					<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
					<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">{project.name}</span>
					{!project.trusted && (
						<Tip label="Not trusted yet">
							<span className="inline-flex shrink-0" aria-label="Not trusted">
								<ShieldAlertIcon className="size-4 text-warning" />
							</span>
						</Tip>
					)}
				</CollapsibleTrigger>
				<Tip label={`New chat in ${project.name}`}>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`New chat in ${project.name}`}
						className="text-muted-foreground"
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
									className="text-muted-foreground"
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
								onClick={() =>
									void navigate({ to: "/settings/mcp", search: { project: project.path } })
								}
							>
								<Settings2Icon />
								{project.trusted ? "Project settings" : "Project settings (trust it first)"}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onRemove}>
							<FolderMinusIcon />
							Remove from Epsilon
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-all duration-base data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
				<SidebarMenu className="ml-3 w-auto border-l pl-2">
					{sessions.map((session) => (
						<SessionItem
							key={session.id}
							session={session}
							project={project.path}
							active={session.id === activeId}
							animate={isFresh(session)}
							onRename={onRename}
							onPin={onPin}
							onDelete={onDelete}
						/>
					))}
				</SidebarMenu>
			</CollapsibleContent>
		</Collapsible>
	);
}
