/**
 * The three extension requests that ask for a choice or text. `confirm` is an
 * AlertDialog instead (docs/ui.md, Concept to component).
 */
import { useState } from "react";
import type { DialogQuestion, RpcExtensionUIResponse } from "shared";

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

export function QuestionDialog({
	question,
	onAnswer,
}: {
	question: Question;
	onAnswer: (response: RpcExtensionUIResponse) => void;
}) {
	const [text, setText] = useState(question.method === "editor" ? (question.prefill ?? "") : "");
	const answer = (value: string) =>
		onAnswer({ type: "extension_ui_response", id: question.id, value });
	const cancel = () =>
		onAnswer({ type: "extension_ui_response", id: question.id, cancelled: true });

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
					<div className="flex flex-col gap-1.5">
						{question.options.map((option) => (
							<Button
								key={option}
								variant="outline"
								className="justify-start"
								onClick={() => answer(option)}
							>
								{option}
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
						className="min-h-40 font-mono text-[13px]"
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
