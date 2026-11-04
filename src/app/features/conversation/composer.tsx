import { useCallback, useEffect, useRef, useState } from "react";

import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { takeHandedOffDraft } from "./draft.ts";

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
	draft,
	sessionId,
	writable,
}: {
	onSend: (text: string) => Promise<void>;
	onAbort: () => Promise<void>;
	busy: boolean;
	/** Text pi put back, such as the message a tree move undid. */
	draft: { readonly text: string; readonly nonce: string } | undefined;
	/** The chat this box writes to, so a fork's text follows its new file. */
	sessionId: string;
	writable: boolean;
}) {
	// A fork's text belongs to the new chat; this composer only takes it under that id.
	const [text, setText] = useState(() => takeHandedOffDraft(sessionId) ?? "");
	const [handedTo, setHandedTo] = useState(sessionId);
	// A fork's text belongs to the new chat; the route reaches it one render later.
	if (handedTo !== sessionId) {
		setHandedTo(sessionId);
		const handed = takeHandedOffDraft(sessionId);
		if (handed !== undefined) {
			setText((current) => (current === "" ? handed : `${handed}\n\n${current}`));
		}
	}
	const [failure, setFailure] = useState<Error | undefined>(undefined);
	const [sending, setSending] = useState(false);
	const applied = useRef<string | undefined>(undefined);

	// pi's own editor puts a restored message in front of what is already typed.
	useEffect(() => {
		if (draft === undefined || applied.current === draft.nonce) return;
		applied.current = draft.nonce;
		setText((current) => (current === "" ? draft.text : `${draft.text}\n\n${current}`));
	}, [draft]);

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
				{failure !== undefined && <Notice error={failure} title="The message was not sent" />}
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
