import type { ReactNode } from "react";

/**
 * The first screen of a conversation: the heading and the box that starts it. Home and
 * an empty session show the same thing, so both say it here.
 */
export function ConversationWelcome({
	place,
	composer,
	status,
}: {
	place: "chat" | "project";
	composer: ReactNode;
	/** A running turn or a notice, shown just above the box that starts the chat. */
	status?: ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-1 animate-enter-rise flex-col items-center justify-center gap-6 overflow-y-auto p-6">
			<h1 className="max-w-xl text-center text-display">
				{place === "chat" ? "Ask epsilon anything." : "What are we building?"}
			</h1>
			<div className="w-full">
				{status}
				{composer}
			</div>
		</div>
	);
}
