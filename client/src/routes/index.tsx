/**
 * The session list: pi's files for this project, newest first, with the live
 * state only the server knows. Opening a session is a URL, so a reload and a
 * resumed tab land on the same transcript.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SessionList } from "@/components/sessions/session-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { deleteSession, fetchSessions } from "@/lib/api";

const SESSIONS_QUERY_KEY = ["sessions"] as const;
/** Live children come and go outside this tab, so the badges poll. */
const LIVE_REFRESH_MS = 5_000;

export const Route = createFileRoute("/")({
	component: function SessionListPage() {
		const navigate = useNavigate();
		const queryClient = useQueryClient();
		const [confirming, setConfirming] = useState<string | undefined>(undefined);
		const sessions = useQuery({
			queryKey: SESSIONS_QUERY_KEY,
			queryFn: fetchSessions,
			refetchInterval: LIVE_REFRESH_MS,
		});
		const remove = useMutation({
			mutationFn: deleteSession,
			onSuccess: async () => {
				setConfirming(undefined);
				await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
			},
		});

		const open = (sessionId: string): void => {
			void navigate({ to: "/sessions/$sessionId", params: { sessionId } });
		};
		const problem = sessions.error ?? remove.error;
		const data = sessions.data;

		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center justify-between gap-3 border-b px-4 py-2">
					<div className="min-w-0">
						<div className="text-sm font-medium">Sessions</div>
						<div className="truncate text-xs text-muted-foreground">
							{data?.project ?? "loading…"}
						</div>
					</div>
					<Button size="sm" onClick={() => open(crypto.randomUUID())}>
						New session
					</Button>
				</div>

				{problem !== null && (
					<div className="p-3">
						<Alert variant="destructive">
							<AlertTitle>Sessions</AlertTitle>
							<AlertDescription>{problem.message}</AlertDescription>
						</Alert>
					</div>
				)}

				<div className="min-h-0 flex-1 overflow-y-auto">
					{data === undefined ? (
						<p className="px-4 py-6 text-sm text-muted-foreground">
							{problem === null ? "Loading sessions…" : "Sessions could not load."}
						</p>
					) : data.sessions.length === 0 ? (
						<div className="flex justify-center p-6">
							<Empty>
								<EmptyHeader>
									<EmptyTitle>No sessions yet</EmptyTitle>
									<EmptyDescription>
										Start one here, or run `pi` in this project and it appears in this list.
									</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button size="sm" onClick={() => open(crypto.randomUUID())}>
										New session
									</Button>
								</EmptyContent>
							</Empty>
						</div>
					) : (
						<SessionList
							sessions={data.sessions}
							confirming={confirming}
							onAskDelete={setConfirming}
							onCancelDelete={() => setConfirming(undefined)}
							onDelete={(id) => remove.mutate(id)}
						/>
					)}
				</div>
			</div>
		);
	},
});
