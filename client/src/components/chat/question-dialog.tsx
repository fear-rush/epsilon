/**
 * The three extension requests that ask for a choice or text. `confirm` is an
 * AlertDialog instead (docs/ui.md, Concept to component).
 */
import { useState } from "react";
import type { DialogAnswer, DialogQuestion } from "shared";

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

type Question = Exclude<DialogQuestion, { method: "confirm" }>;

/**
 * pi's permission extension prefixes each option with a colour dot. The choice is
 * already said in words, so the glyph is dropped instead of carrying pi's palette
 * into the dialog (docs/ui.md: no glyphs from pi).
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
	const [text, setText] = useState(question.method === "editor" ? (question.prefill ?? "") : "");
	const answer = (value: string) => onAnswer({ id: question.id, value });
	const cancel = () => onAnswer({ id: question.id, cancelled: true });

	return (
		<Dialog open onOpenChange={() => {}}>
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
