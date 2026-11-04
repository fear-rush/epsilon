import { useState } from "react";

import type { DialogAnswer, DialogQuestion } from "#protocol/conversation/extui";
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

/**
 * An extension's question, answered in the page.
 *
 * One dialog at a time: pi queues the rest behind the answer. The page cannot dismiss it,
 * because pi is waiting for an answer and the escape route is Cancel.
 */
export function ConversationDialogs({
	dialogs,
	onAnswer,
}: {
	dialogs: ReadonlyArray<DialogQuestion>;
	onAnswer: (answer: DialogAnswer) => Promise<void>;
}) {
	const question = dialogs[0];
	if (question === undefined) return null;
	return (
		<Dialog open>
			<DialogContent showCloseButton={false}>
				<DialogBody key={question.id} question={question} onAnswer={onAnswer} />
			</DialogContent>
		</Dialog>
	);
}

function DialogBody({
	question,
	onAnswer,
}: {
	question: DialogQuestion;
	onAnswer: (answer: DialogAnswer) => Promise<void>;
}) {
	const [text, setText] = useState("");

	const answer = (value: DialogAnswer): void => {
		void onAnswer(value);
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>{question.title}</DialogTitle>
				{question.message !== undefined && (
					<DialogDescription>{question.message}</DialogDescription>
				)}
			</DialogHeader>

			{question.kind === "confirm" && (
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => answer({ confirmed: false, id: question.id, kind: "confirm" })}
					>
						Cancel
					</Button>
					<Button onClick={() => answer({ confirmed: true, id: question.id, kind: "confirm" })}>
						Confirm
					</Button>
				</DialogFooter>
			)}

			{question.kind === "select" && (
				<div className="grid gap-2">
					{question.options.map((option, index) => (
						<Button
							key={option}
							variant="outline"
							className="justify-start"
							onClick={() => answer({ id: question.id, index, kind: "select" })}
						>
							{option}
						</Button>
					))}
				</div>
			)}

			{question.kind === "input" && (
				<div className="grid gap-2">
					<Input
						aria-label={question.title}
						value={text}
						placeholder={question.placeholder ?? ""}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") answer({ id: question.id, kind: "input", text });
						}}
					/>
					<Button onClick={() => answer({ id: question.id, kind: "input", text })}>OK</Button>
				</div>
			)}
		</>
	);
}
