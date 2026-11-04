import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	ChevronRightIcon,
	FolderIcon,
	MessageSquareIcon,
	MoreHorizontalIcon,
	PinIcon,
	PlusIcon,
	SearchXIcon,
	SettingsIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";

import type { SessionSummary } from "#protocol/sessions";
import { SearchField } from "@/components/patterns/list/search-field";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { agentHomeQuery } from "@/queries";
import { call } from "@/runtime";

import { labelOf } from "./label.ts";
import { DeleteChatDialog, RenameChatDialog } from "./session-menu.tsx";
import { sidebarRows } from "./sidebar-rows.ts";
import type { SidebarRow } from "./sidebar-rows.ts";
import { useSessions } from "./use-sessions";

/**
 * The chat column: a new chat, the search, the projects with their chats, the plain chats,
 * and the app's own entry points.
 *
 * The list is flat and virtualized, so a thousand chats cost what a screenful costs. Pinned
 * chats arrive first from the server; within a group they keep that order. One row menu is
 * the code every row shares, and the dialogs live once in this component.
 */
export function SessionSidebar() {
	const sessions = useSessions();
	const home = useChatsDir();
	const navigate = useNavigate();
	const match = useMatchRoute();
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [renaming, setRenaming] = useState<SessionSummary | undefined>(undefined);
	const [deleting, setDeleting] = useState<SessionSummary | undefined>(undefined);
	const [failure, setFailure] = useState<string | undefined>(undefined);

	const current = match({ to: "/sessions/$sessionId", fuzzy: true });
	const currentId = current === false ? undefined : current.sessionId;

	const needle = query.trim().toLowerCase();
	const filtered = useMemo(() => {
		const all = sessions.data?.sessions ?? [];
		if (needle === "") return all;
		return all.filter(
			(session) =>
				labelOf(session).toLowerCase().includes(needle) ||
				session.cwd.toLowerCase().includes(needle),
		);
	}, [sessions.data, needle]);

	const rows = sidebarRows(filtered, home, needle === "" ? collapsed : new Set());
	const toggleProject = useCallback((folder: string) => {
		setCollapsed((previous) => {
			const next = new Set(previous);
			if (next.has(folder)) next.delete(folder);
			else next.add(folder);
			return next;
		});
	}, []);

	const queryClient = useQueryClient();
	const refresh = (): void => {
		void queryClient.invalidateQueries({ queryKey: ["sessions"] });
	};
	const rename = useMutation({
		mutationFn: (input: { sessionId: string; name: string }) =>
			call((client) => client["sessions.rename"](input)),
		onSuccess: () => {
			setRenaming(undefined);
			setFailure(undefined);
			refresh();
		},
		onError: (error: Error) => setFailure(error.message),
	});
	const remove = useMutation({
		mutationFn: (sessionId: string) => call((client) => client["sessions.remove"]({ sessionId })),
		onSuccess: (_value, sessionId) => {
			setDeleting(undefined);
			setFailure(undefined);
			refresh();
			if (sessionId === currentId) void navigate({ to: "/" });
		},
		onError: (error: Error) => setFailure(error.message),
	});
	const pin = useMutation({
		mutationFn: (input: { sessionId: string; pinned: boolean }) =>
			call((client) => client["sessions.setPinned"](input)),
		onSuccess: () => {
			setFailure(undefined);
			refresh();
		},
		onError: (error: Error) => setFailure(error.message),
	});

	const pinChat = pin.mutate;
	const onMenu = useCallback(
		(action: "rename" | "delete" | "pin", session: SessionSummary) => {
			if (action === "rename") setRenaming(session);
			if (action === "delete") setDeleting(session);
			if (action === "pin") pinChat({ pinned: !session.pinned, sessionId: session.id });
		},
		[pinChat],
	);

	return (
		<Pane border className="w-list shrink-0">
			<PaneBar
				title="Chats"
				actions={
					<Button size="sm" variant="outline" onClick={() => void navigate({ to: "/" })}>
						<PlusIcon />
						New chat
					</Button>
				}
			/>
			<div className="p-pane">
				<SearchField value={query} onChange={setQuery} label="Search chats" />
			</div>
			{sessions.data?.pinsProblem !== undefined && (
				<div className="px-pane pb-pane">
					<Notice tone="warning" title="Pinned chats could not be read">
						{sessions.data.pinsProblem}
					</Notice>
				</div>
			)}
			{failure !== undefined && (
				<div className="px-pane pb-pane">
					<Notice tone="error" title="That did not change">
						{failure}
					</Notice>
				</div>
			)}
			<div className="min-h-0 flex-1 px-pane pb-pane">
				<SessionRows
					rows={rows}
					sessions={sessions}
					onToggleProject={toggleProject}
					onMenu={onMenu}
					filtering={needle !== ""}
				/>
			</div>
			<footer className="grid gap-2 border-t p-pane">
				<Link
					to="/settings/general"
					className="flex items-center gap-2 text-body text-muted-foreground transition-colors duration-fast hover:text-foreground"
				>
					<SettingsIcon className="size-4" />
					Settings
				</Link>
			</footer>

			<RenameChatDialog
				session={renaming}
				onClose={() => setRenaming(undefined)}
				onRename={(sessionId, name) => rename.mutate({ name, sessionId })}
				error={rename.isPending ? undefined : failure}
				pending={rename.isPending}
			/>
			<DeleteChatDialog
				session={deleting}
				onClose={() => setDeleting(undefined)}
				onDelete={(sessionId) => remove.mutate(sessionId)}
				error={remove.isPending ? undefined : failure}
				pending={remove.isPending}
			/>
		</Pane>
	);
}

/** The agent home's chats folder: a chat there is a plain chat, not a project. */
function useChatsDir(): string | undefined {
	const home = useQuery(agentHomeQuery).data;
	return home === undefined ? undefined : `${home}/chats`;
}

function SessionRows({
	rows,
	sessions,
	onToggleProject,
	onMenu,
	filtering,
}: {
	rows: ReadonlyArray<SidebarRow>;
	sessions: ReturnType<typeof useSessions>;
	onToggleProject: (folder: string) => void;
	onMenu: (action: "rename" | "delete" | "pin", session: SessionSummary) => void;
	filtering: boolean;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	// The virtualizer is an external store, not a value React can memoize.
	// oxlint-disable-next-line react/incompatible-library
	const virtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: (index) => (rows[index]?.kind === "chat" ? 56 : 32),
		getItemKey: (index) => rows[index]?.key ?? index,
		getScrollElement: () => scroll.current,
		overscan: 10,
	});

	if (sessions.isPending) {
		return (
			<div className="flex items-center justify-center p-6">
				<LoadingState label="Reading chats…" />
			</div>
		);
	}
	if (sessions.error !== null) {
		const view = errorView(sessions.error);
		return <StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />;
	}
	if (rows.length === 0) {
		return (
			<StatusView
				icon={filtering ? SearchXIcon : MessageSquareIcon}
				title={filtering ? "No matching chat" : "No chats yet"}
				line={filtering ? "Try a different name." : "A new chat is one message away."}
			/>
		);
	}

	return (
		<div ref={scroll} aria-label="Chats" className="h-full overflow-y-auto">
			<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((item) => {
					const row = rows[item.index];
					if (row === undefined) return null;
					return (
						<div
							key={item.key}
							ref={virtualizer.measureElement}
							data-index={item.index}
							className="absolute inset-x-0 top-0"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							{row.kind === "heading" && (
								<h3 className="pt-3 pb-1 text-meta font-medium text-muted-foreground">
									{row.label}
								</h3>
							)}
							{row.kind === "project" && (
								<button
									type="button"
									onClick={() => onToggleProject(row.folder)}
									aria-expanded={row.open}
									className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-body text-muted-foreground transition-colors duration-fast hover:bg-muted/60 hover:text-foreground"
								>
									<ChevronRightIcon
										className={cn(
											"size-4 transition-transform duration-fast",
											row.open && "rotate-90",
										)}
									/>
									<FolderIcon className="size-4" />
									<span className="truncate">{row.label}</span>
									<span className="ml-auto text-meta">{row.count}</span>
								</button>
							)}
							{row.kind === "chat" && (
								<SessionItem session={row.session} project={row.project} onMenu={onMenu} />
							)}
							{row.kind === "empty" && (
								<p className="px-2 py-2 text-meta text-muted-foreground">
									No chats yet. A new chat is one message away.
								</p>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** One chat row. Memoized: a change to another row must not re-render it. */
const SessionItem = memo(function SessionItem({
	session,
	project,
	onMenu,
}: {
	session: SessionSummary;
	project: string | undefined;
	onMenu: (action: "rename" | "delete" | "pin", session: SessionSummary) => void;
}) {
	return (
		<div className="group relative">
			<Link
				to="/sessions/$sessionId"
				params={{ sessionId: session.id }}
				className="block rounded-md px-2 py-2 pr-8 transition-colors duration-fast hover:bg-muted/60"
				activeProps={{ className: "bg-muted" }}
			>
				<span className="flex items-center gap-1">
					{session.pinned && (
						<PinIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
					)}
					<span className="block truncate text-body">{labelOf(session)}</span>
				</span>
				<span className="block truncate text-meta text-muted-foreground">
					{project ?? session.cwd}
				</span>
			</Link>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`Actions for ${labelOf(session)}`}
					className="absolute top-2 right-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
				>
					<MoreHorizontalIcon className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => onMenu("rename", session)}>Rename</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onMenu("pin", session)}>
						{session.pinned ? "Unpin" : "Pin"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onClick={() => onMenu("delete", session)}>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
