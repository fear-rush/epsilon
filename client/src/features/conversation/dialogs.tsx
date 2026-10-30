import type { DialogAnswer, DialogQuestion } from "shared";
import { useDialogMotion } from "@/hooks/use-dialog-motion";
import { useState } from "react";

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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
		<AlertDialog
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) answer(false);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{question.title}</AlertDialogTitle>
					<AlertDialogDescription className="whitespace-pre-wrap break-words">
						{question.message}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => answer(false)}>No</AlertDialogCancel>
					<AlertDialogAction onClick={() => answer(true)}>Yes</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * The three extension requests that ask for a choice or text. `confirm` is an
 * AlertDialog instead (docs/ARCHITECTURE.md, UI rules).
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
		<Dialog
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{question.title}</DialogTitle>
					<DialogDescription>
						{question.method === "select"
							? "Choose one option to continue."
							: "The agent is waiting for this answer."}
					</DialogDescription>
				</DialogHeader>

				{question.method === "select" && (
					<div className="flex min-w-0 flex-col gap-1.5">
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
						className="min-h-40 font-mono text-sm"
						onChange={(event) => setText(event.target.value)}
					/>
				)}

				<DialogFooter>
					<Button variant="ghost" onClick={cancel}>
						Cancel
					</Button>
					{question.method !== "select" && <Button onClick={() => answer(text)}>Submit</Button>}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
