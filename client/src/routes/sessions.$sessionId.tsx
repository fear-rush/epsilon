/**
 * One session: transcript, blocking questions, composer. The id comes from the
 * URL, so a reload, a bookmark and a phone reattach all land on the same
 * transcript and the same live child.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { transcript } from "shared";

import { QuestionRow } from "@/components/chat/question-row";
import { ModelPicker } from "@/components/composer/model-picker";
import { Transcript } from "@/components/chat/transcript";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { useConversation } from "@/hooks/use-conversation";

export const Route = createFileRoute("/sessions/$sessionId")({
	component: function Session() {
		const { sessionId } = Route.useParams();
		const { store, snapshot } = useConversation(sessionId);
		const [prompt, setPrompt] = useState("");
		const rows = transcript(snapshot.state);
		const { busy, running, needsInput, dialogs, statuses, widgets, title, models, model } =
			snapshot.state;
		const aboveComposer = widgets.filter((widget) => widget.placement === "aboveEditor");
		const belowComposer = widgets.filter((widget) => widget.placement === "belowEditor");

		const submit = () => {
			const message = prompt.trim();
			if (message === "") return;
			if (busy) store.steer(message);
			else store.sendPrompt(message);
			setPrompt("");
		};

		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
					{title !== undefined && <span className="font-medium text-foreground">{title}</span>}
					<span data-status={snapshot.status}>{snapshot.status}</span>
					{snapshot.status === "open" && (
						<span>{running ? (busy ? "working" : "idle") : "agent stopped"}</span>
					)}
					{needsInput && <span className="font-medium text-amber-600">needs input</span>}
					{statuses.map((status) => (
						<span key={status.key} className="rounded bg-muted px-1.5 py-0.5 font-mono">
							{status.text}
						</span>
					))}
					<div className="ml-auto">
						<ModelPicker
							models={models}
							model={model}
							onSelect={(next) => store.setModel(next.provider, next.id)}
						/>
					</div>
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

				{widgets.length > 0 && (
					<div className="flex flex-col gap-1 border-t px-4 py-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
						{[...aboveComposer, ...belowComposer].map((widget) => (
							<div key={widget.key} data-placement={widget.placement}>
								{widget.lines.join("\n")}
							</div>
						))}
					</div>
				)}

				<div className="border-t p-3">
					<div className="mx-auto flex w-full max-w-3xl items-end gap-2">
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder={
								busy
									? "Steer the run (Enter steers, Esc stops)"
									: "Message the agent (Enter sends, Shift+Enter is a newline)"
							}
							className="max-h-40 min-h-11 flex-1 resize-none"
							onKeyDown={(event) => {
								if (event.key === "Escape" && busy) {
									event.preventDefault();
									store.abort();
									return;
								}
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									submit();
								}
							}}
						/>
						{busy && (
							<Button variant="outline" onClick={() => store.abort()}>
								stop
							</Button>
						)}
						<Button onClick={submit}>{busy ? "steer" : "send"}</Button>
					</div>
				</div>
			</div>
		);
	},
});
