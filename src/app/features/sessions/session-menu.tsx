import { useState } from "react";

import type { SessionSummary } from "#protocol/sessions";
import { Notice } from "@/components/patterns/status/notice";
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

import { labelOf } from "./label.ts";

/**
 * Rename and delete, shared by every row: one dialog for the row the menu was opened on,
 * so a hundred rows do not each mount a dialog.
 */
export function RenameChatDialog({
	session,
	onClose,
	onRename,
	error,
	pending,
}: {
	session: SessionSummary | undefined;
	onClose: () => void;
	onRename: (sessionId: string, name: string) => void;
	error: string | undefined;
	pending: boolean;
}) {
	if (session === undefined) return null;
	return (
		<RenameDialogBody
			key={session.id}
			session={session}
			onClose={onClose}
			onRename={onRename}
			error={error}
			pending={pending}
		/>
	);
}

function RenameDialogBody({
	session,
	onClose,
	onRename,
	error,
	pending,
}: {
	session: SessionSummary;
	onClose: () => void;
	onRename: (sessionId: string, name: string) => void;
	error: string | undefined;
	pending: boolean;
}) {
	const original = session.name ?? session.firstMessage;
	const [name, setName] = useState(original);

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename chat</DialogTitle>
					<DialogDescription>
						pi records the new name in the chat&apos;s file, so a terminal sees it too.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim() !== "") onRename(session.id, name.trim());
					}}
				>
					<Input
						aria-label="Chat name"
						value={name}
						placeholder={original}
						autoComplete="off"
						onChange={(event) => setName(event.target.value)}
					/>
					{error !== undefined && (
						<Notice tone="error" title="The chat was not renamed">
							{error}
						</Notice>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={pending || name.trim() === ""}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function DeleteChatDialog({
	session,
	onClose,
	onDelete,
	error,
	pending,
}: {
	session: SessionSummary | undefined;
	onClose: () => void;
	onDelete: (sessionId: string) => void;
	error: string | undefined;
	pending: boolean;
}) {
	if (session === undefined) return null;
	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete this chat?</DialogTitle>
					<DialogDescription>
						{`“${labelOf(session)}” and its file are removed from the agent home. This cannot be undone.`}
					</DialogDescription>
				</DialogHeader>
				{error !== undefined && (
					<Notice tone="error" title="The chat was not deleted">
						{error}
					</Notice>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="destructive" disabled={pending} onClick={() => onDelete(session.id)}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
