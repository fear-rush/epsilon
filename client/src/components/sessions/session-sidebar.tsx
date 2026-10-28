/**
 * The session list, in the sidebar. pi owns the files; this polls the REST route
 * for the live badges and deletes through the same route, confirming first.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import type { SessionSummary } from "shared";

import { SessionItem } from "@/components/sessions/session-item";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	useSidebar,
} from "@/components/ui/sidebar";
import { deleteSession, fetchSessions } from "@/lib/api";
import { sessionLabel } from "@/lib/format";

const SESSIONS_QUERY_KEY = ["sessions"] as const;
/** Live children come and go outside this tab, so the badges poll. */
const LIVE_REFRESH_MS = 5_000;

export function SessionSidebar() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const queryClient = useQueryClient();
	const { isMobile, setOpenMobile } = useSidebar();
	const [pendingDelete, setPendingDelete] = useState<SessionSummary | undefined>(undefined);
	const sessions = useQuery({
		queryKey: SESSIONS_QUERY_KEY,
		queryFn: fetchSessions,
		refetchInterval: LIVE_REFRESH_MS,
	});
	const remove = useMutation({
		mutationFn: deleteSession,
		onSuccess: async () => {
			setPendingDelete(undefined);
			await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
		},
	});

	const open = (sessionId: string): void => {
		if (isMobile) setOpenMobile(false);
		void navigate({ to: "/sessions/$sessionId", params: { sessionId } });
	};
	const matched = matchRoute({ to: "/sessions/$sessionId" });
	const activeId = matched === false ? undefined : matched.sessionId;
	const problem = sessions.error ?? remove.error;
	const project = sessions.data?.project;
	const projectLabel = project?.split("/").at(-1) ?? project ?? "Sessions";

	return (
		<Sidebar>
			<div className="flex items-center justify-between gap-2 p-2">
				<span className="px-1 text-sm font-medium">epsilon</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="New session"
					onClick={() => open(crypto.randomUUID())}
				>
					<PlusIcon />
				</Button>
			</div>

			<SidebarContent>
				{problem !== null && (
					<div className="px-2">
						<Alert variant="destructive">
							<AlertTitle>Sessions</AlertTitle>
							<AlertDescription>{problem.message}</AlertDescription>
						</Alert>
					</div>
				)}

				<SidebarGroup>
					<SidebarGroupLabel title={project}>{projectLabel}</SidebarGroupLabel>
					{sessions.isPending ? (
						<div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
							<Spinner />
							Loading sessions…
						</div>
					) : sessions.data !== undefined && sessions.data.sessions.length === 0 ? (
						<p className="px-2 py-1 text-xs text-muted-foreground">No sessions yet.</p>
					) : (
						<SidebarMenu>
							{(sessions.data?.sessions ?? []).map((session) => (
								<SessionItem
									key={session.id}
									session={session}
									active={session.id === activeId}
									onDelete={setPendingDelete}
								/>
							))}
						</SidebarMenu>
					)}
				</SidebarGroup>
			</SidebarContent>

			<AlertDialog
				open={pendingDelete !== undefined}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this session?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete === undefined ? "" : sessionLabel(pendingDelete)} is removed from pi's
							list and its file is deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (pendingDelete !== undefined) remove.mutate(pendingDelete.id);
							}}
						>
							{remove.isPending && <Spinner data-icon="inline-start" />}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Sidebar>
	);
}
