/**
 * One session: header, transcript, blocking questions, composer. The id comes
 * from the URL, so a reload, a bookmark and a phone reattach all land on the
 * same transcript and the same live engine.
 */
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { transcript } from "shared";
import type { DialogQuestion } from "shared";

import { ConfirmDialog } from "@/components/chat/confirm-dialog";
import { QuestionDialog } from "@/components/chat/question-dialog";
import { Transcript } from "@/components/chat/transcript";
import { Composer } from "@/components/composer/composer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConversation } from "@/hooks/use-conversation";

const isConfirm = (
	question: DialogQuestion,
): question is Extract<DialogQuestion, { method: "confirm" }> => question.method === "confirm";

export const Route = createFileRoute("/sessions/$sessionId")({
	component: function Session() {
		const { sessionId } = Route.useParams();
		const { store, snapshot } = useConversation(sessionId);
		const rows = transcript(snapshot.state);
		const { busy, dialogs, statuses, widgets, title, sessionName, commands } = snapshot.state;
		const { models, model } = snapshot.state;
		const confirmations = dialogs.filter(isConfirm);
		const questions = dialogs.filter((dialog) => !isConfirm(dialog));
		const aboveComposer = widgets.filter((widget) => widget.placement === "aboveEditor");
		const belowComposer = widgets.filter((widget) => widget.placement === "belowEditor");

		const header = (content: ReactNode) => (
			<header className="flex items-center gap-2 border-b px-3 py-1.5">
				<SidebarTrigger />
				{content}
			</header>
		);

		// A session that has no snapshot yet shows a loader, not an empty transcript.
		if (snapshot.status !== "open" || !snapshot.loaded) {
			return (
				<div className="flex min-h-0 flex-1 flex-col">
					{header(<Skeleton className="h-4 w-40" />)}
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
						{snapshot.status === "blocked" ? (
							<Alert variant="destructive" className="max-w-md">
								<AlertTitle>Version mismatch</AlertTitle>
								<AlertDescription>
									<p>This tab was loaded from a different build than the server speaks.</p>
									<Button variant="outline" onClick={() => window.location.reload()}>
										Reload
									</Button>
								</AlertDescription>
							</Alert>
						) : snapshot.status === "closed" ? (
							<Alert variant="destructive" className="max-w-md">
								<AlertTitle>Disconnected</AlertTitle>
								<AlertDescription>The socket to the server closed. Reconnecting…</AlertDescription>
							</Alert>
						) : (
							<>
								<Spinner className="size-5 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">
									{snapshot.loaded ? "Reconnecting to the agent…" : "Loading the session…"}
								</p>
							</>
						)}
					</div>
				</div>
			);
		}

		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header(
					<span className="truncate text-sm font-medium text-foreground">
						{title ?? sessionName ?? "Session"}
					</span>,
				)}

				{questions.map((question) => (
					<QuestionDialog
						key={question.id}
						question={question}
						onAnswer={(answer) => store.answerDialog(answer)}
					/>
				))}
				{confirmations.map((question) => (
					<ConfirmDialog
						key={question.id}
						question={question}
						onAnswer={(answer) => store.answerDialog(answer)}
					/>
				))}

				{rows.length === 0 ? (
					<div className="flex flex-1 items-center justify-center p-6">
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No messages yet</EmptyTitle>
								<EmptyDescription>Ask for something to start the session.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : (
					<Transcript rows={rows} />
				)}

				{widgets.length > 0 && (
					<div className="flex flex-col gap-1 border-t px-4 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
						{[...aboveComposer, ...belowComposer].map((widget) => (
							<div key={widget.key} data-placement={widget.placement}>
								{widget.lines.join("\n")}
							</div>
						))}
					</div>
				)}

				<Composer
					store={store}
					busy={busy}
					models={models}
					model={model}
					statuses={statuses}
					commands={commands}
				/>
			</div>
		);
	},
});
