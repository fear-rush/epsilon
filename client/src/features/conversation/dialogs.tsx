import type { DialogAnswer, DialogQuestion } from "shared";
import { useDialogMotion } from "@/hooks/use-dialog-motion";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";

/** A blocking `confirm`: the agent cannot continue until this is answered. */

type ConfirmQuestion = Extract<DialogQuestion, { method: "confirm" }>;

export function ConfirmDialog({
	question,
	onAnswer,
}: {
	question: ConfirmQuestion;
	onAnswer: (answer: DialogAnswer) => void;
}) {
	const dialog = useDialogMotion();
	// The answer is sent after the exit plays, so the dialog the store removes on the
	// server's reply is already gone from the screen.
	const answer = (confirmed: boolean) =>
		dialog.close(() => onAnswer({ id: question.id, method: "confirm", confirmed }));

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) answer(false);
			}}
			size="sm"
			title={question.title}
			footer={
				<>
					<Button variant="outline" onClick={() => answer(false)}>
						No
					</Button>
					<Button onClick={() => answer(true)}>Yes</Button>
				</>
			}
		>
			<p className="text-body break-words whitespace-pre-wrap">{question.message}</p>
		</DialogFrame>
	);
}

/**
 * The three extension requests that ask for a choice or text. `confirm` is its own
 * small dialog above.
 */

type Question = Exclude<DialogQuestion, { method: "confirm" }>;

/**
 * pi's permission extension prefixes each option with a colour dot. The choice is
 * already said in words, so the glyph is dropped instead of carrying pi's palette
 * into the dialog (docs/ARCHITECTURE.md, UI rules: colour carries state only).
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
	const [text, setText] = useState(question.method === "editor" ? (question.prefill ?? "") : "");
	// The answer carries the method it belongs to, so the server can refuse one that
	// was meant for another kind of question. It is sent after the exit plays.
	const answer = (value: string) =>
		dialog.close(() => {
			if (question.method === "select") onAnswer({ id: question.id, method: "select", value });
			else if (question.method === "input") onAnswer({ id: question.id, method: "input", value });
			else onAnswer({ id: question.id, method: "editor", value });
		});
	const cancel = () => dialog.close(() => onAnswer({ id: question.id, method: "cancel" }));

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
			size={question.method === "editor" ? "md" : "sm"}
			title={question.title}
			footer={
				<>
					<Button variant="destructive" onClick={cancel}>
						Cancel
					</Button>
					{question.method !== "select" && <Button onClick={() => answer(text)}>Submit</Button>}
				</>
			}
		>
			{question.method === "select" && (
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
			{question.method === "input" && (
				<Input
					value={text}
					placeholder={question.placeholder}
					onChange={(event) => setText(event.target.value)}
				/>
			)}
			{question.method === "editor" && (
				<Textarea
					value={text}
					className="h-full resize-none font-mono text-code"
					onChange={(event) => setText(event.target.value)}
				/>
			)}
		</DialogFrame>
	);
}
