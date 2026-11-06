/**
 * An extension's blocking question, answered in the page.
 *
 * pi blocks the tool call until this answers, and the page cannot dismiss it: Cancel is
 * the answer. The answer is sent after the exit plays, so the dialog the engine removes on
 * the reply is already gone from the screen.
 */
import { useEffect, useState } from "react";

import type { DialogAnswer, DialogQuestion } from "#protocol/conversation/extui";
import { Confirmation } from "@/components/ai-elements/confirmation";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDialogMotion } from "@/hooks/use-dialog-motion";

/**
 * The seconds a timed question has left. The frame carries the clock time the question
 * closes at, so a tab that attached late counts down from pi's deadline instead of from
 * the moment it arrived.
 */
function useCountdown(question: DialogQuestion): number | undefined {
	const deadlineAt = question.deadlineAt;
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (deadlineAt === undefined) return undefined;
		const ticker = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(ticker);
	}, [deadlineAt]);
	if (deadlineAt === undefined) return undefined;
	return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

/** The countdown in a footer, when the question has a deadline at all. */
function Countdown({ seconds }: { seconds: number | undefined }) {
	if (seconds === undefined) return null;
	return <span className="text-meta text-muted-foreground sm:mr-auto">Closes in {seconds}s</span>;
}

type ConfirmQuestion = Extract<DialogQuestion, { kind: "confirm" }>;

/** A blocking `confirm`: the agent cannot continue until this is answered. */
export function ConfirmDialog({
	question,
	onAnswer,
}: {
	question: ConfirmQuestion;
	onAnswer: (answer: DialogAnswer) => void;
}) {
	const dialog = useDialogMotion();
	const remaining = useCountdown(question);
	const answer = (confirmed: boolean) =>
		dialog.close(() => onAnswer({ confirmed, id: question.id, kind: "confirm" }));

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) answer(false);
			}}
			size="sm"
			body="content"
			title={question.title}
			footer={remaining === undefined ? undefined : <Countdown seconds={remaining} />}
		>
			<Confirmation
				description={question.message}
				approveLabel="Yes"
				denyLabel="No"
				onApprove={() => answer(true)}
				onDeny={() => answer(false)}
			/>
		</DialogFrame>
	);
}

/** The three requests that ask for a choice or text; `confirm` is its own small dialog. */
type Question = Exclude<DialogQuestion, { kind: "confirm" }>;

/**
 * pi's permission extension prefixes each option with a colour dot. The choice is
 * already said in words, so the glyph is dropped instead of carrying pi's palette
 * into the dialog (DESIGN.md, UI rules: colour carries state only).
 */
const DECORATIVE_PREFIX = /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;
const plainOption = (option: string): string => option.replace(DECORATIVE_PREFIX, "");

export function QuestionDialog({
	question,
	onAnswer,
}: {
	question: Question;
	onAnswer: (answer: DialogAnswer) => void;
}) {
	const dialog = useDialogMotion();
	const remaining = useCountdown(question);
	const [text, setText] = useState(question.kind === "editor" ? (question.prefill ?? "") : "");
	// The answer carries the kind it belongs to, so the engine can refuse one that was
	// meant for another kind of question.
	const answer = (value: string) =>
		dialog.close(() => {
			if (question.kind === "select") {
				onAnswer({ id: question.id, index: question.options.indexOf(value), kind: "select" });
			} else if (question.kind === "input")
				onAnswer({ id: question.id, kind: "input", text: value });
			else onAnswer({ id: question.id, kind: "editor", text: value });
		});
	const cancel = () => dialog.close(() => onAnswer({ id: question.id, kind: "cancelled" }));

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
			size={question.kind === "editor" ? "md" : "sm"}
			title={question.title}
			footer={
				<>
					<Countdown seconds={remaining} />
					<Button variant="destructive" onClick={cancel}>
						Cancel
					</Button>
					{question.kind !== "select" && <Button onClick={() => answer(text)}>Submit</Button>}
				</>
			}
		>
			{question.kind === "select" && (
				<div className="flex min-w-0 flex-col gap-row">
					{question.options.map((option) => (
						<Button
							key={option}
							variant="outline"
							className="h-auto min-w-0 justify-start py-2 text-left break-words whitespace-normal"
							onClick={() => answer(option)}
						>
							{plainOption(option)}
						</Button>
					))}
				</div>
			)}
			{question.kind === "input" && (
				<Input
					value={text}
					placeholder={question.placeholder}
					onChange={(event) => setText(event.target.value)}
				/>
			)}
			{question.kind === "editor" && (
				<Textarea
					value={text}
					className="h-full resize-none font-mono text-code"
					onChange={(event) => setText(event.target.value)}
				/>
			)}
		</DialogFrame>
	);
}
