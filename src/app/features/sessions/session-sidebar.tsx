import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon, PlusIcon, SearchXIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";

import type { SessionSummary } from "#protocol/sessions";
import { SearchField } from "@/components/patterns/list/search-field";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";

import { useSessions } from "./use-sessions";

/**
 * The chat column: a new chat, the search, every chat on disk, and the app's own status.
 *
 * pi owns the files; this list is the catalog's read of them. A row's name is pi's own
 * session name when one was set, and the first message otherwise, which is what makes a
 * reloaded page find the chat that was just written.
 */
export function SessionSidebar() {
	const sessions = useSessions();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const all = sessions.data ?? [];
	const rows =
		needle === "" ? all : all.filter((session) => labelOf(session).toLowerCase().includes(needle));

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
			<nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto px-pane pb-pane">
				<SessionList sessions={sessions} rows={rows} filtering={needle !== ""} />
			</nav>
			<footer className="grid gap-2 border-t p-pane">
				<Link
					to="/settings/general"
					className="flex items-center gap-2 text-body text-muted-foreground transition-colors duration-fast hover:text-foreground"
				>
					<SettingsIcon className="size-4" />
					Settings
				</Link>
			</footer>
		</Pane>
	);
}

function SessionList({
	sessions,
	rows,
	filtering,
}: {
	sessions: ReturnType<typeof useSessions>;
	rows: ReadonlyArray<SessionSummary>;
	filtering: boolean;
}) {
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
		<ul className="grid gap-row">
			{rows.map((session) => (
				<li key={session.id}>
					<Link
						to="/sessions/$sessionId"
						params={{ sessionId: session.id }}
						className="block rounded-md px-2 py-2 transition-colors duration-fast hover:bg-muted/60"
						activeProps={{ className: "bg-muted" }}
					>
						<span className="block truncate text-body">{labelOf(session)}</span>
						<span className="block truncate text-meta text-muted-foreground">{session.cwd}</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

/** pi's own name first, then the first message, then a placeholder that still links. */
export function labelOf(session: SessionSummary): string {
	const name = session.name ?? "";
	if (name.trim() !== "") return name;
	const first = session.firstMessage.trim();
	return first === "" ? "New chat" : first;
}
