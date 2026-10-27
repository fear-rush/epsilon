/**
 * The session page for S2: transcript, blocking questions, composer. One session
 * per page for now; the session list and resume arrive in S3.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { transcript } from "shared";
import { z } from "zod";

import { QuestionRow } from "@/components/chat/question-row";
import { Transcript } from "@/components/chat/transcript";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConversation } from "@/hooks/use-conversation";

export const Route = createFileRoute("/")({
	// `?session=<id>` opens a session the CLI created: no session list yet (S3).
	validateSearch: z.object({ session: z.string().optional() }),
	component: function Session() {
		const { session } = Route.useSearch();
		const { store, snapshot } = useConversation(session);
		const [prompt, setPrompt] = useState("");
		const rows = transcript(snapshot.state);
		const { running, needsInput, dialogs } = snapshot.state;

		const submit = () => {
			const message = prompt.trim();
			if (message === "") return;
			store.sendPrompt(message);
			setPrompt("");
		};

		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
					<span data-status={snapshot.status}>{snapshot.status}</span>
					<span>{running ? "running" : "idle"}</span>
					{needsInput && <span className="font-medium text-amber-600">needs input</span>}
				</div>

				{dialogs.length > 0 && (
					<div className="flex flex-col gap-2 border-b p-3">
						{dialogs.map((question) => (
							<QuestionRow
								key={question.id}
								question={question}
								onAnswer={(answer) => store.answerDialog(answer)}
							/>
						))}
					</div>
				)}

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

				<div className="border-t p-3">
					<div className="mx-auto flex w-full max-w-3xl items-end gap-2">
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="Message the agent (Enter sends, Shift+Enter is a newline)"
							className="max-h-40 min-h-11 flex-1 resize-none"
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									submit();
								}
							}}
						/>
						<Button onClick={submit}>send</Button>
					</div>
				</div>
			</div>
		);
	},
});
