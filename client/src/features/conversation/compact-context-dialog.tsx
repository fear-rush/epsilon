/**
 * Manual compaction: pi replaces the chat's history with a summary, and accepts
 * optional instructions for what that summary should keep. Refusals (`Nothing to
 * compact`) are pi's to explain, so this dialog only sends the command.
 */
import { useState } from "react";

import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const FORM_ID = "compact-context";

export function CompactContextDialog({
	open,
	onOpenChange,
	onCompact,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCompact: (instructions: string | undefined) => void;
}) {
	const [draft, setDraft] = useState("");
	const [wasOpen, setWasOpen] = useState(false);
	// A new opening starts blank; a blank field means "let pi decide".
	if (open !== wasOpen) {
		setWasOpen(open);
		if (!open) setDraft("");
	}
	const instructions = draft.trim();

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			title="Compact context"
			description="pi replaces this chat's history with a summary. A running turn is stopped first."
			footer={
				<>
					<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form={FORM_ID}>
						Compact
					</Button>
				</>
			}
		>
			<form
				id={FORM_ID}
				className="grid gap-field"
				onSubmit={(event) => {
					event.preventDefault();
					onCompact(instructions === "" ? undefined : instructions);
					onOpenChange(false);
				}}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="compact-instructions">Instructions</FieldLabel>
						<Textarea
							id="compact-instructions"
							value={draft}
							autoFocus
							placeholder="What the summary should keep"
							onChange={(event) => setDraft(event.target.value)}
						/>
						<FieldDescription>
							Optional. Name decisions, open questions or files already changed.
						</FieldDescription>
					</Field>
				</FieldGroup>
			</form>
		</DialogFrame>
	);
}
