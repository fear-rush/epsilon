/**
 * Rename a chat through pi's session name entry. The draft starts from the name
 * the chat has now every time the dialog opens.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { sessionLabel } from "@/features/sessions/format";
import type { SessionSummary } from "@/api/types";

const FORM_ID = "rename-chat";

export function RenameDialog({
	open,
	session,
	pending,
	error,
	onOpenChange,
	onRename,
}: {
	open: boolean;
	session: SessionSummary | undefined;
	pending: boolean;
	error: Error | null;
	onOpenChange: (open: boolean) => void;
	onRename: (name: string) => void;
}) {
	const [draft, setDraft] = useState("");
	const [wasOpen, setWasOpen] = useState(false);
	// A new opening starts from the chat's current name, not from the last edit.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open && session !== undefined) setDraft(session.name ?? sessionLabel(session));
	}
	const name = draft.trim();
	const invalid = name === "";

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			title="Rename chat"
			footer={
				<>
					<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form={FORM_ID} disabled={invalid || pending}>
						{pending && <Spinner data-icon="inline-start" />}
						Rename
					</Button>
				</>
			}
		>
			<form
				id={FORM_ID}
				className="grid gap-field"
				onSubmit={(event) => {
					event.preventDefault();
					if (!invalid) onRename(name);
				}}
			>
				<FieldGroup>
					<Field data-invalid={invalid}>
						<FieldLabel htmlFor="chat-name">Name</FieldLabel>
						<Input
							id="chat-name"
							value={draft}
							autoFocus
							autoComplete="off"
							maxLength={200}
							aria-invalid={invalid}
							onChange={(event) => setDraft(event.target.value)}
						/>
						{invalid && <FieldError>A chat needs a name.</FieldError>}
					</Field>
				</FieldGroup>
				{error !== null && <Notice tone="error">{error.message}</Notice>}
			</form>
		</DialogFrame>
	);
}
