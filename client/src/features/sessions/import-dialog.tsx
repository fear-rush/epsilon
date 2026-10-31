/**
 * Import a session file. pi's `forkFrom` copies the JSONL's whole history into a new
 * chat whose folder is the one named here, so the imported chat belongs where the
 * page says it does (docs/DECISIONS.md, Session copies). The path is the one thing
 * only the operator knows, so it is typed, and the server answers a refusal in its
 * own words.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { importSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const FORM_ID = "import-session";

export function ImportSessionDialog({
	open,
	onOpenChange,
	project,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The project this page is in; without one the chat lands in the chats folder. */
	project: string | undefined;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string | undefined>(undefined);
	const [wasOpen, setWasOpen] = useState(false);

	// A new opening starts from an empty field and no refusal from the last one.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setDraft("");
			setProblem(undefined);
		}
	}

	const path = draft.trim();
	const invalid = path === "";

	const submit = async (): Promise<void> => {
		setPending(true);
		setProblem(undefined);
		try {
			const id = await importSession(path, project);
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
			onOpenChange(false);
			await navigate({
				to: "/sessions/$sessionId",
				params: { sessionId: id },
				search: { project },
			});
		} catch (cause) {
			setProblem(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPending(false);
		}
	};

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			title="Import a session"
			description="pi copies a JSONL file's history into a new chat, under a new id."
			footer={
				<>
					<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form={FORM_ID} disabled={invalid || pending}>
						{pending && <Spinner data-icon="inline-start" />}
						Import
					</Button>
				</>
			}
		>
			<form
				id={FORM_ID}
				className="grid gap-field"
				onSubmit={(event) => {
					event.preventDefault();
					if (!invalid) void submit();
				}}
			>
				<FieldGroup>
					<Field data-invalid={invalid}>
						<FieldLabel htmlFor="session-path">Path to the .jsonl file</FieldLabel>
						<Input
							id="session-path"
							value={draft}
							autoFocus
							autoComplete="off"
							spellCheck={false}
							placeholder="/home/you/chat.jsonl"
							aria-invalid={invalid}
							onChange={(event) => setDraft(event.target.value)}
						/>
						<FieldDescription>
							{project === undefined
								? "The chat lands in Epsilon's chats folder."
								: "The chat lands in this project's folder."}
						</FieldDescription>
						{invalid && <FieldError>The file needs a path.</FieldError>}
					</Field>
				</FieldGroup>
				{problem !== undefined && <Notice tone="error">{problem}</Notice>}
			</form>
		</DialogFrame>
	);
}
