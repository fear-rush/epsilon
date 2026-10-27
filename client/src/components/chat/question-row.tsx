import { useState } from "react";
import type { DialogQuestion, RpcExtensionUIResponse } from "shared";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type QuestionRowProps = {
	question: DialogQuestion;
	onAnswer: (response: RpcExtensionUIResponse) => void;
};

/** One blocking extension question: confirm, select, input or editor. */
export function QuestionRow({ question, onAnswer }: QuestionRowProps) {
	const [text, setText] = useState("");
	const id = question.id;
	const label = question.method === "confirm" ? question.message : question.title;

	return (
		<div className="rounded border border-amber-500 bg-amber-50 p-2 text-amber-950">
			<div className="font-semibold">
				{question.method}: {label}
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				{question.method === "confirm" && (
					<>
						<Button
							size="sm"
							onClick={() => onAnswer({ type: "extension_ui_response", id, confirmed: true })}
						>
							yes
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => onAnswer({ type: "extension_ui_response", id, confirmed: false })}
						>
							no
						</Button>
					</>
				)}
				{question.method === "select" &&
					question.options.map((option) => (
						<Button
							key={option}
							size="sm"
							variant="outline"
							onClick={() => onAnswer({ type: "extension_ui_response", id, value: option })}
						>
							{option}
						</Button>
					))}
				{(question.method === "input" || question.method === "editor") && (
					<>
						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							placeholder={question.method === "input" ? question.placeholder : undefined}
							className="min-h-10 w-96"
						/>
						<Button
							size="sm"
							onClick={() => onAnswer({ type: "extension_ui_response", id, value: text })}
						>
							submit
						</Button>
					</>
				)}
				<Button
					size="sm"
					variant="ghost"
					onClick={() => onAnswer({ type: "extension_ui_response", id, cancelled: true })}
				>
					cancel
				</Button>
			</div>
		</div>
	);
}
