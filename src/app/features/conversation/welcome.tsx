import type { ReactNode } from "react";

import { Suggestion } from "@/components/ai-elements/suggestion";

/** The prompts an empty chat offers; they are starting points, not a script. */
const SUGGESTIONS: Record<"chat" | "project", ReadonlyArray<string>> = {
	chat: ["What can you do?", "Help me plan a change", "Summarize a file", "Review my last change"],
	project: [
		"Explain this project",
		"Run the tests",
		"Review the last change",
		"Find the failing test",
	],
};

/**
 * The first screen of a conversation: the heading, a few prompts that send in one click,
 * and the box that starts it. Home and an empty session show the same thing, so both say
 * it here.
 */
export function ConversationWelcome({
	place,
	composer,
	status,
	onSuggestion,
	suggestionsDisabled = false,
}: {
	place: "chat" | "project";
	composer: ReactNode;
	/** A running turn or a notice, shown just above the box that starts the chat. */
	status?: ReactNode;
	/** A click sends the prompt; absent leaves the suggestions out. */
	onSuggestion?: ((text: string) => void) | undefined;
	suggestionsDisabled?: boolean;
}) {
	return (
		<div className="flex min-h-0 flex-1 animate-enter-rise flex-col items-center justify-center gap-6 overflow-y-auto p-6">
			<h1 className="max-w-xl text-center text-display">
				{place === "chat" ? "Ask epsilon anything." : "What are we building?"}
			</h1>
			<div className="mx-auto flex w-full max-w-content flex-col gap-3">
				{onSuggestion === undefined ? undefined : (
					<Suggestion
						suggestions={SUGGESTIONS[place]}
						onSelect={onSuggestion}
						disabled={suggestionsDisabled}
					/>
				)}
				{status}
				{composer}
			</div>
		</div>
	);
}
