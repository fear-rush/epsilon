/** A blocking `confirm`: the agent cannot continue until this is answered. */
import type { DialogAnswer, DialogQuestion } from "shared";

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

type ConfirmQuestion = Extract<DialogQuestion, { method: "confirm" }>;

export function ConfirmDialog({
	question,
	onAnswer,
}: {
	question: ConfirmQuestion;
	onAnswer: (answer: DialogAnswer) => void;
}) {
	const answer = (confirmed: boolean) =>
		onAnswer({ id: question.id, method: "confirm", confirmed });

	return (
		<AlertDialog open onOpenChange={() => {}}>
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
