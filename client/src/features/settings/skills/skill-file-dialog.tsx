import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { saveSkillBundleFile } from "@/api/endpoints";
import type { SkillRoot } from "@/api/types";
import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSettingsProject, useSkillBundleFile } from "@/features/settings/queries";
import { languageOf } from "./skill-file-tree";

/**
 * One bundled text file, opened from the Files card. It has its own Save and
 * Discard; the form's draft is never touched. The page asks before closing it
 * with unsaved text.
 */
export function SkillFileDialog({
	root,
	name,
	path,
	onDirtyChange,
	onSaved,
	onClose,
}: {
	root: SkillRoot;
	name: string;
	path: string;
	onDirtyChange: (dirty: boolean) => void;
	onSaved: () => void;
	onClose: () => void;
}) {
	const project = useSettingsProject();
	const query = useSkillBundleFile(root, name, path);
	// What the file held when it was read or last saved, and the text being edited.
	const [savedText, setSavedText] = useState<string | undefined>();
	const [edited, setEdited] = useState<string | undefined>();
	const base = savedText ?? query.data;
	const text = edited ?? base ?? "";
	const dirty = base !== undefined && text !== base;
	const edit = (next: string) => {
		setEdited(next);
		onDirtyChange(next !== base);
	};
	const save = useMutation({
		mutationFn: (value: string) => saveSkillBundleFile(project, root, name, path, value),
		onSuccess: (_, value) => {
			setSavedText(value);
			onDirtyChange(value !== text);
			onSaved();
		},
	});

	return (
		<DialogFrame
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			size="lg"
			title={<span className="font-mono">{path}</span>}
			footer={
				<>
					<Button type="button" variant="outline" onClick={onClose}>
						Close
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!dirty || save.isPending}
						onClick={() => {
							setEdited(undefined);
							onDirtyChange(false);
						}}
					>
						Discard
					</Button>
					<Button
						type="button"
						disabled={!dirty || save.isPending}
						onClick={() => save.mutate(text)}
					>
						{save.isPending && <Spinner data-icon="inline-start" />}
						Save file
					</Button>
				</>
			}
		>
			{query.isPending ? (
				<div className="flex h-full items-center justify-center">
					<LoadingState label={`Reading ${path}…`} />
				</div>
			) : query.error !== null ? (
				<StatusView {...errorView(query.error)} />
			) : (
				<div className="flex h-full min-h-0 flex-col gap-2">
					<CodeEditor
						label={path}
						language={languageOf(path)}
						value={text}
						onChange={edit}
						className="min-h-0 flex-1"
					/>
					{save.error !== null && <Notice tone="error">{save.error.message}</Notice>}
				</div>
			)}
		</DialogFrame>
	);
}
