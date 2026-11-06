/**
 * The sidebar: projects, then chats. pi owns the files; the socket's change stream
 * refreshes the list, and a delete is confirmed first. A folder appears here once it has a
 * chat on disk, and the search filters both lists by name and first message. Connection
 * problems are the app banner's, not this column's.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import {
	ChevronRightIcon,
	FolderIcon,
	FolderMinusIcon,
	FolderPlusIcon,
	FolderUpIcon,
	MessageSquareIcon,
	MoreHorizontalIcon,
	PlusIcon,
	SearchXIcon,
	Settings2Icon,
	ShieldAlertIcon,
	ShieldCheckIcon,
	ShieldOffIcon,
	SquarePenIcon,
} from "lucide-react";
import { useState } from "react";

import type { ProjectTrustAction } from "#protocol/settings/projects";
import { DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { SearchField } from "@/components/patterns/list/search-field";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { toneText } from "@/components/patterns/status/status-tone";
import { StatusView } from "@/components/patterns/status/status-view";
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
import { Separator } from "@/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { call } from "@/core/runtime";
import { FolderDialog, useSetProjectTrust } from "@/features/projects";
import { SidebarAccount } from "@/features/sessions/sidebar-account";
import { useLastDefined } from "@/hooks/use-last-defined";

import { sessionLabel } from "./format.ts";
import type { ProjectSessions, SessionSummary } from "./list.ts";
import { useSessionList } from "./list.ts";
import { RenameDialog } from "./rename-dialog";
import { SessionItem } from "./session-item";

/** A row modified this close to the last poll is a chat that just arrived. */
const FRESH_SESSION_MS = 10_000;

/** One page of a sidebar list; Load more adds another. */
const PAGE_SIZE = 10;

/** A page count for one list. Its own component keeps its own depth. */
function useLoadMore(): [number, () => void] {
	const [limit, setLimit] = useState(PAGE_SIZE);
	return [limit, () => setLimit((current) => current + PAGE_SIZE)];
}

/** The one way a list asks for its next page; the label is also its accessible name. */
function LoadMore({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<SidebarMenuItem>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="w-full justify-center text-muted-foreground"
				aria-label={label}
				onClick={onClick}
			>
				Load more
			</Button>
		</SidebarMenuItem>
	);
}

/** A project and its chats, for the one confirmation that removes its history. */
type FolderRemoval = {
	readonly path: string;
	readonly name: string;
	readonly sessions: ReadonlyArray<SessionSummary>;
};

/** The search reads what the list already carries: a chat's name and first message. */
const chatMatches = (session: SessionSummary, needle: string): boolean =>
	`${session.name ?? ""}\n${session.firstMessage}`.toLowerCase().includes(needle);

const filteredChats = (
	chats: ReadonlyArray<SessionSummary>,
	needle: string,
): ReadonlyArray<SessionSummary> =>
	needle === "" ? chats : chats.filter((chat) => chatMatches(chat, needle));

/** A project matches its folder name; one that does keeps every chat it holds. */
const filteredProjects = (
	entries: ReadonlyArray<ProjectSessions>,
	needle: string,
): ReadonlyArray<ProjectSessions> =>
	needle === ""
		? entries
		: entries
				.map((entry) =>
					entry.project.name.toLowerCase().includes(needle)
						? entry
						: { ...entry, sessions: filteredChats(entry.sessions, needle) },
				)
				.filter((entry) => entry.sessions.length > 0);

export function SessionSidebar() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const queryClient = useQueryClient();
	const { isMobile, setOpenMobile } = useSidebar();
	const [pendingDelete, setPendingDelete] = useState<SessionSummary | undefined>(undefined);
	const shownDelete = useLastDefined(pendingDelete);
	const [pendingFolder, setPendingFolder] = useState<FolderRemoval | undefined>(undefined);
	const shownFolder = useLastDefined(pendingFolder);
	const [renaming, setRenaming] = useState<SessionSummary | undefined>(undefined);
	const [renameOpen, setRenameOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [opening, setOpening] = useState(false);
	const [projectLimit, moreProjects] = useLoadMore();
	const [chatLimit, moreChats] = useLoadMore();
	const sessions = useSessionList();
	const remove = useMutation({
		mutationFn: (id: string) => call((client) => client["sessions.remove"]({ sessionId: id })),
		onSuccess: async (_done, id) => {
			setPendingDelete(undefined);
			// The open chat is gone; leave its page instead of reattaching to nothing.
			if (id === activeId) void navigate({ to: "/", search: {} });
			await queryClient.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
	const forgetProject = useMutation({
		// Epsilon has no project record: removing a project removes its chats, and the
		// folder stays where it is. The server checks every chat before deleting one, so a
		// refusal leaves the project exactly as it was.
		mutationFn: (folder: FolderRemoval) =>
			call((client) => client["sessions.removeProject"]({ directory: folder.path })),
		onSuccess: async (_removed, folder) => {
			setPendingFolder(undefined);
			if (folder.sessions.some((session) => session.id === activeId)) {
				void navigate({ to: "/", search: {} });
			}
			await queryClient.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
	const renameChat = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			call((client) => client["sessions.rename"]({ name, sessionId: id })),
		onSuccess: async () => {
			setRenameOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
	const projectTrust = useSetProjectTrust();
	const pinChat = useMutation({
		mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
			call((client) => client["sessions.setPinned"]({ pinned, sessionId: id })),
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: ["sessions"] });
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
	const chats = sessions.data?.chats ?? [];
	const needle = query.trim().toLowerCase();
	const searching = needle !== "";
	const matchedProjects = filteredProjects(projects, needle);
	const matchedChats = filteredChats(chats, needle);
	// A search is the escape hatch to the whole list, so it shows every match instead of
	// paging them; browsing shows one page and asks before showing the next.
	const shownProjects = searching ? matchedProjects : matchedProjects.slice(0, projectLimit);
	const shownChats = searching ? matchedChats : matchedChats.slice(0, chatLimit);
	const noMatches = searching && matchedProjects.length === 0 && matchedChats.length === 0;
	const showProjects = !searching || matchedProjects.length > 0;
	const showChats = !searching || matchedChats.length > 0;
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

			<div className="grid shrink-0 animate-enter-drop gap-pane px-pane pt-pane enter-delay-1">
				<SearchField value={query} onChange={setQuery} label="Search chats" />
				<Button variant="ghost" className="w-full justify-start" onClick={newChat}>
					<SquarePenIcon data-icon="inline-start" />
					New chat
				</Button>
				<Button variant="ghost" className="w-full justify-start" onClick={() => setOpening(true)}>
					<FolderPlusIcon data-icon="inline-start" />
					New project
				</Button>
			</div>

			<SidebarContent>
				{sessions.isPending ? (
					<div className="flex min-h-0 flex-1 animate-enter-rise items-center justify-center">
						<LoadingState label="Loading chats…" />
					</div>
				) : sessions.isError ? (
					<StatusView error={sessions.error ?? new Error("The chats could not be read.")} />
				) : noMatches ? (
					<div className="flex min-h-0 flex-1 animate-enter-fade flex-col">
						<StatusView icon={SearchXIcon} title="No chats match" />
					</div>
				) : (
					<div className="flex min-h-0 animate-enter-rise flex-col gap-2 enter-delay-2">
						{/* The list mounts when the load settles, one step after the column's chrome. */}
						{showProjects && (
							<SidebarGroup>
								<SidebarGroupLabel>Projects</SidebarGroupLabel>
								<SidebarGroupContent>
									<SidebarMenu>
										{shownProjects.map((entry) => (
											<ProjectGroup
												key={entry.project.path}
												entry={entry}
												activeId={activeId}
												expanded={searching}
												isFresh={isFresh}
												onNewChat={() => startProjectChat(entry.project.path)}
												onRemove={() => {
													forgetProject.reset();
													setPendingFolder({
														name: entry.project.name,
														path: entry.project.path,
														sessions: entry.sessions,
													});
												}}
												onTrust={(action) =>
													projectTrust.mutate({ path: entry.project.path, action })
												}
												onRename={onRename}
												onPin={onPin}
												onDelete={onDelete}
											/>
										))}
										{!searching && matchedProjects.length > shownProjects.length && (
											<LoadMore label="Load more projects" onClick={moreProjects} />
										)}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						)}

						{showChats && (
							<SidebarGroup>
								<SidebarGroupLabel>Chats</SidebarGroupLabel>
								<SidebarGroupContent>
									{matchedChats.length === 0 ? (
										<div className="px-2">
											<InlineStatus icon={MessageSquareIcon}>No chats yet</InlineStatus>
										</div>
									) : (
										<SidebarMenu>
											{shownChats.map((session) => (
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
											{!searching && matchedChats.length > shownChats.length && (
												<LoadMore label="Load more chats" onClick={moreChats} />
											)}
										</SidebarMenu>
									)}
								</SidebarGroupContent>
							</SidebarGroup>
						)}
					</div>
				)}
				{sessions.data?.pinsProblem !== undefined && (
					<div className="px-pane">
						<Notice tone="danger">{sessions.data.pinsProblem}</Notice>
					</div>
				)}
			</SidebarContent>

			{pinChat.error !== null || projectTrust.error !== null ? (
				<div className="grid animate-enter-rise gap-2 px-pane pb-pane">
					{pinChat.error !== null && <Notice error={pinChat.error} />}
					{projectTrust.error !== null && <Notice error={projectTrust.error} />}
				</div>
			) : undefined}

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
					shownDelete === undefined
						? ""
						: `${sessionLabel(shownDelete)} is removed from pi's list and its file is deleted.`
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
				open={pendingFolder !== undefined}
				title={`Remove ${shownFolder?.name ?? "this folder"} from Epsilon?`}
				description={
					shownFolder === undefined
						? ""
						: `Its ${shownFolder.sessions.length === 1 ? "chat is" : `${shownFolder.sessions.length} chats are`} deleted from pi's history. The folder ${shownFolder.path} and its files stay where they are, and opening it again starts fresh.`
				}
				error={forgetProject.error}
				pending={forgetProject.isPending}
				confirmLabel="Remove"
				onOpenChange={(open) => {
					if (!open) {
						forgetProject.reset();
						setPendingFolder(undefined);
					}
				}}
				onConfirm={() => {
					if (pendingFolder !== undefined) forgetProject.mutate(pendingFolder);
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
	expanded,
	isFresh,
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
	isFresh: (session: SessionSummary) => boolean;
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
	return (
		<Collapsible
			open={expanded ? true : open}
			onOpenChange={(next) => {
				if (!expanded) setOpen(next);
			}}
			render={<SidebarMenuItem className="animate-enter-rise" />}
		>
			<div className="group/project flex items-center gap-1">
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&[data-panel-open]>svg:first-child]:rotate-90">
					<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
					<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">{project.name}</span>
					{!project.trusted && (
						<Tip label="Not trusted yet">
							<ShieldAlertIcon
								aria-label="Not trusted"
								className={toneText("warning", "size-4 shrink-0")}
							/>
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
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-all duration-base data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
				<SidebarMenu className="ml-3 w-auto border-l pl-2">
					{shownSessions.map((session) => (
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
					{!expanded && sessions.length > shownSessions.length && (
						<LoadMore label={`Load more chats in ${project.name}`} onClick={moreChats} />
					)}
				</SidebarMenu>
			</CollapsibleContent>
		</Collapsible>
	);
}
