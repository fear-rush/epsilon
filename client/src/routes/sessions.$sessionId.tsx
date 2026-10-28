/**
 * One session: header, transcript, blocking questions, composer. The id comes
 * from the URL, so a reload, a bookmark and a phone reattach all land on the
 * same transcript and the same live child.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";
import { transcript } from "shared";
import type { DialogQuestion } from "shared";

import { ConfirmDialog } from "@/components/chat/confirm-dialog";
import { QuestionDialog } from "@/components/chat/question-dialog";
import { Transcript } from "@/components/chat/transcript";
import { ModelMenu } from "@/components/composer/model-menu";
import { PermissionMenu } from "@/components/composer/permission-menu";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "@/hooks/use-conversation";

const isConfirm = (
	question: DialogQuestion,
): question is Extract<DialogQuestion, { method: "confirm" }> => question.method === "confirm";

export const Route = createFileRoute("/sessions/$sessionId")({
	component: function Session() {
		const { sessionId } = Route.useParams();
		const { store, snapshot } = useConversation(sessionId);
		const [prompt, setPrompt] = useState("");
		const formRef = useRef<HTMLFormElement>(null);
		const rows = transcript(snapshot.state);
		const { busy, running, needsInput, dialogs, statuses, widgets, title, sessionName } =
			snapshot.state;
		const { models, model } = snapshot.state;
		const otherStatuses = statuses.filter((status) => status.key !== "permission");
		const confirmations = dialogs.filter(isConfirm);
		const questions = dialogs.filter((dialog) => !isConfirm(dialog));
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
				<header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-xs text-muted-foreground">
					<SidebarTrigger />
					<span className="max-w-[45vw] truncate text-sm font-medium text-foreground">
						{title ?? sessionName ?? "Session"}
					</span>
					<span data-status={snapshot.status}>{snapshot.status}</span>
					{snapshot.status === "open" &&
						(running ? (
							<span className="flex items-center gap-1.5">
								{busy ? (
									<Skeleton className="size-1.5 rounded-full bg-success" />
								) : (
									<span className="size-1.5 rounded-full bg-muted-foreground/40" />
								)}
								<span className={busy ? "shimmer" : undefined}>{busy ? "working" : "idle"}</span>
							</span>
						) : (
							<span>agent stopped</span>
						))}
					{needsInput && <Badge variant="warning">needs input</Badge>}
					{otherStatuses.map((status) => (
						<Badge key={status.key} variant="secondary" className="font-normal">
							{status.text}
						</Badge>
					))}
				</header>

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
					<div className="flex flex-col gap-1 border-t px-4 py-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
						{[...aboveComposer, ...belowComposer].map((widget) => (
							<div key={widget.key} data-placement={widget.placement}>
								{widget.lines.join("\n")}
							</div>
						))}
					</div>
				)}

				<div className="border-t p-3">
					<div className="mx-auto w-full max-w-3xl">
						<form
							ref={formRef}
							onSubmit={(event) => {
								event.preventDefault();
								submit();
							}}
						>
							<InputGroup>
								<InputGroupTextarea
									value={prompt}
									onChange={(event) => setPrompt(event.target.value)}
									placeholder={
										busy
											? "Steer the run (Enter steers, Esc stops)"
											: "Message the agent (Enter sends, Shift+Enter is a newline)"
									}
									className="max-h-40 min-h-11 p-3"
									onKeyDown={(event) => {
										if (event.key === "Escape" && busy) {
											event.preventDefault();
											store.abort();
											return;
										}
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											formRef.current?.requestSubmit();
										}
									}}
								/>
								<InputGroupAddon align="block-end">
									<ModelMenu
										models={models}
										model={model}
										onSelect={(next) => store.setModel(next.provider, next.id)}
									/>
									<PermissionMenu
										statuses={statuses}
										onSelect={(mode) => store.setPermission(mode)}
									/>
									{busy && (
										<InputGroupButton
											size="icon-sm"
											variant="outline"
											className="rounded-full"
											aria-label="Stop the run"
											onClick={() => store.abort()}
										>
											<SquareIcon />
										</InputGroupButton>
									)}
									<InputGroupButton
										type="submit"
										size="icon-sm"
										variant="default"
										className="rounded-full"
										disabled={prompt.trim() === ""}
										aria-label={busy ? "Steer" : "Send"}
									>
										<ArrowUpIcon />
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
						</form>
					</div>
				</div>
			</div>
		);
	},
});
