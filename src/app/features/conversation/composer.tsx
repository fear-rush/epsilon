import { useCallback, useState } from "react";

import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The one input of a chat.
 *
 * Enter sends and Shift+Enter adds a line, which is the habit a chat box trains. A refused
 * command is shown here in the feature's words instead of disappearing; a chat whose file
 * changed outside Epsilon is read-only, and the status line says how to get it back.
 */
export function Composer({
	onSend,
	onAbort,
	busy,
	writable,
}: {
	onSend: (text: string) => Promise<void>;
	onAbort: () => Promise<void>;
	busy: boolean;
	writable: boolean;
}) {
	const [text, setText] = useState("");
	const [failure, setFailure] = useState<Error | undefined>(undefined);
	const [sending, setSending] = useState(false);

	const send = useCallback(async () => {
		const trimmed = text.trim();
		if (trimmed === "" || !writable || sending) return;
		setSending(true);
		try {
			await onSend(trimmed);
			setText("");
			setFailure(undefined);
		} catch (cause) {
			setFailure(cause instanceof Error ? cause : new Error(String(cause)));
		} finally {
			setSending(false);
		}
	}, [text, writable, sending, onSend]);

	return (
		<div className="border-t p-pane">
			<div className="mx-auto grid w-full max-w-content gap-2">
				{failure !== undefined && (
					<Notice tone="error" title="The message was not sent">
						{failure.message}
					</Notice>
				)}
				<Textarea
					aria-label="Message"
					placeholder={
						writable ? "Message Epsilon…" : "This chat is read-only until it is reloaded."
					}
					value={text}
					rows={2}
					disabled={!writable}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							void send();
						}
					}}
				/>
				<div className="flex items-center justify-between gap-2">
					<span className="text-meta text-muted-foreground">
						Enter sends, Shift+Enter adds a line.
					</span>
					{busy ? (
						<Button variant="outline" size="sm" onClick={() => void onAbort()}>
							Stop
						</Button>
					) : (
						<Button
							size="sm"
							disabled={text.trim() === "" || !writable}
							onClick={() => void send()}
						>
							Send
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
