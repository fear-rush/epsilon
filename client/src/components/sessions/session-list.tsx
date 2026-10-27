import { Link } from "@tanstack/react-router";
import type { SessionSummary } from "shared";

import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format";

type SessionListProps = {
	sessions: SessionSummary[];
	confirming: string | undefined;
	onAskDelete: (id: string) => void;
	onCancelDelete: () => void;
	onDelete: (id: string) => void;
};

/** The first line of the first user message, or a name the user set. */
const label = (session: SessionSummary): string => {
	if (session.name !== undefined) return session.name;
	const firstLine = session.firstMessage.split("\n")[0]?.trim() ?? "";
	return firstLine === "" ? "Untitled session" : firstLine;
};

export function SessionList({
	sessions,
	confirming,
	onAskDelete,
	onCancelDelete,
	onDelete,
}: SessionListProps) {
	return (
		<ul data-slot="session-list" className="divide-y">
			{sessions.map((session) => (
				<li key={session.id} className="flex items-start gap-3 px-4 py-3">
					<Link
						to="/sessions/$sessionId"
						params={{ sessionId: session.id }}
						className="flex min-w-0 flex-1 flex-col gap-1"
					>
						<span className="truncate text-sm font-medium">{label(session)}</span>
						<span className="truncate text-xs text-muted-foreground">
							{formatWhen(session.modified)} · {session.messageCount} messages
						</span>
					</Link>
					<div className="flex shrink-0 items-center gap-2">
						{session.needsInput && (
							<span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
								needs input
							</span>
						)}
						{session.running && (
							<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
								<span className="size-2 animate-pulse rounded-full bg-emerald-500" />
								running
							</span>
						)}
						{confirming === session.id ? (
							<>
								<Button size="xs" variant="destructive" onClick={() => onDelete(session.id)}>
									Delete
								</Button>
								<Button size="xs" variant="ghost" onClick={onCancelDelete}>
									Cancel
								</Button>
							</>
						) : (
							<Button size="xs" variant="ghost" onClick={() => onAskDelete(session.id)}>
								Delete
							</Button>
						)}
					</div>
				</li>
			))}
		</ul>
	);
}
