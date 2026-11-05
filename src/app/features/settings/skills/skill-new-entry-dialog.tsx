/**
 * New file or new folder in the Raw view's tree. The path is checked here first and
 * again on the server; the card's list and the tree refresh once it is written. The
 * dialog stays mounted so its opening and closing transition can play.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { SkillRoot } from "#protocol/settings/skills";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useLastDefined } from "@/hooks/use-last-defined";

import { settingsKeys } from "../keys.ts";
import { useSettingsProject } from "../queries.ts";
import { createSkillFolder, writeSkillFile } from "./api.ts";
import { newFileProblem, newFolderProblem } from "./skill-file-tree.ts";

export type NewEntryKind = "file" | "folder";

const COPY: Record<
	NewEntryKind,
	{ title: string; action: string; label: string; placeholder: string; description: string }
> = {
	file: {
		title: "New file",
		action: "Create file",
		label: "Path",
		placeholder: "references/notes.md",
		description: "The file starts empty, and the folders in its path are created too.",
	},
	folder: {
		title: "New folder",
		action: "Create folder",
		label: "Path",
		placeholder: "references",
		description: "An empty folder, listed in the tree until it holds a file.",
	},
};

const FORM_ID = "new-skill-entry";

export function SkillNewEntryDialog({
	open,
	kind,
	root,
	name,
	files,
	folders,
	onCreated,
	onClose,
}: {
	open: boolean;
	/** Cleared as it closes; the last kind stays on screen for the exit. */
	kind: NewEntryKind | undefined;
	root: SkillRoot;
	name: string;
	files: readonly string[];
	folders: readonly string[];
	onCreated: (path: string) => void;
	onClose: () => void;
}) {
	const project = useSettingsProject();
	const queryClient = useQueryClient();
	const [path, setPath] = useState("");
	const [problem, setProblem] = useState<string | undefined>();
	const [wasOpen, setWasOpen] = useState(false);
	// A new opening starts from an empty path, not from the last attempt.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setPath("");
			setProblem(undefined);
		}
	}
	const shownKind = useLastDefined(kind);
	const entryKind = shownKind ?? "file";
	const copy = COPY[entryKind];
	const create = useMutation({
		mutationFn: (target: string) =>
			entryKind === "file"
				? writeSkillFile(project, root, name, target, "")
				: createSkillFolder(project, root, name, target),
		onSuccess: (_, target) => {
			void queryClient.invalidateQueries({
				queryKey: settingsKeys.skillFiles(project, root, name),
			});
			onCreated(target);
		},
	});

	const submit = () => {
		const trimmed = path.trim();
		// A file cannot take a folder's name, so a file is checked against both.
		const found =
			entryKind === "file"
				? newFileProblem(trimmed, new Set([...files, ...folders]))
				: newFolderProblem(trimmed, new Set(files), new Set(folders));
		setProblem(found);
		if (found === undefined) create.mutate(trimmed);
	};

	/** Closing drops the last refusal, so the next opening starts clean. */
	const close = () => {
		create.reset();
		onClose();
	};

	return (
		<DialogFrame
			open={open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			size="sm"
			body="content"
			title={copy.title}
			footer={
				<>
					<Button type="button" variant="destructive" onClick={close}>
						Cancel
					</Button>
					<Button type="submit" form={FORM_ID} disabled={create.isPending}>
						{create.isPending && <Spinner data-icon="inline-start" />}
						{copy.action}
					</Button>
				</>
			}
		>
			<form
				id={FORM_ID}
				className="grid gap-field"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<FieldGroup>
					<Field data-invalid={problem !== undefined}>
						<FieldLabel htmlFor="new-entry-path">{copy.label}</FieldLabel>
						<Input
							id="new-entry-path"
							value={path}
							autoComplete="off"
							placeholder={copy.placeholder}
							aria-invalid={problem !== undefined}
							onChange={(event) => {
								setPath(event.target.value);
								setProblem(undefined);
								create.reset();
							}}
						/>
						<FieldDescription>{copy.description}</FieldDescription>
						{problem !== undefined && <FieldError>{problem}</FieldError>}
						{create.error !== null && <Notice error={create.error} />}
					</Field>
				</FieldGroup>
			</form>
		</DialogFrame>
	);
}
