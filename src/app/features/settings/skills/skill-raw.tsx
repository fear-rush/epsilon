import { FilePlusIcon, FolderPlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FileTree } from "@/components/ai-elements/file-tree";
import type { FileTreeTarget } from "@/components/ai-elements/file-tree";
import { CancelDialog } from "@/components/patterns/confirm-dialogs";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { SkillDeleteEntryDialog } from "./skill-delete-entry-dialog.tsx";
import { SkillNewEntryDialog } from "./skill-new-entry-dialog.tsx";
import type { NewEntryKind } from "./skill-new-entry-dialog.tsx";
import { RawPane } from "./skill-raw-pane.tsx";
import { useRawFile, useRawFiles, useRawSave } from "./skill-raw-source.ts";
import type { RawSource } from "./skill-raw-source.ts";

/**
 * The Raw tab: every file in the skill folder on the left, the selected file's exact text
 * on the right. Each file has its own Save and Discard, and moving to another file or tab
 * asks before it drops unsaved text. Binary files are listed and never opened.
 */
export function SkillRaw({
	source,
	path,
	onPathChange,
	onDirtyChange,
	onSaved,
}: {
	source: RawSource;
	/** The open file, owned by the page so a link in the preview can choose it. */
	path: string;
	onPathChange: (path: string) => void;
	onDirtyChange: (dirty: boolean) => void;
	/** Called after `SKILL.md` is written, so the form reads the new text. */
	onSaved: () => void;
}) {
	const list = useRawFiles(source);
	const [dirty, setDirty] = useState(false);
	const [pending, setPending] = useState<string | undefined>();
	const files = useMemo(
		() => list.data?.files.map((file) => ({ path: file.path, disabled: !file.text })) ?? [],
		[list.data],
	);
	const folders = list.data?.folders ?? [];
	const [creating, setCreating] = useState<NewEntryKind | undefined>();
	const [removing, setRemoving] = useState<FileTreeTarget | undefined>();
	/** Switching files from the tree, asking first when this file has unsaved text. */
	const select = (next: string): void => {
		if (next === path) return;
		if (dirty) setPending(next);
		else onPathChange(next);
	};

	// The page's callback may change on every render; only leaving the tab clears the flag.
	const report = useRef(onDirtyChange);
	useEffect(() => {
		report.current = onDirtyChange;
	});
	useEffect(() => () => report.current(false), []);
	const changeDirty = (value: boolean) => {
		setDirty(value);
		onDirtyChange(value);
	};

	if (list.isPending) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<LoadingState label="Reading files…" />
			</div>
		);
	}
	if (list.error !== null) return <StatusView {...errorView(list.error)} />;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-card md:flex-row">
			<div className="flex min-h-0 shrink-0 flex-col gap-2 md:w-nav">
				<div className="flex h-8 items-center justify-between gap-2">
					<span className="text-meta font-medium text-muted-foreground">Files</span>
					{source.kind === "editable" && (
						<div className="flex items-center">
							<Tip label="New file">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="New file"
									onClick={() => setCreating("file")}
								>
									<FilePlusIcon />
								</Button>
							</Tip>
							<Tip label="New folder">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="New folder"
									onClick={() => setCreating("folder")}
								>
									<FolderPlusIcon />
								</Button>
							</Tip>
						</div>
					)}
				</div>
				<nav className="max-h-dialog-body-sm min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card p-2 md:max-h-none">
					<FileTree
						files={files}
						folders={folders}
						selected={path}
						first="SKILL.md"
						disabledHint="Binary file"
						onSelect={select}
						{...(source.kind === "editable" ? { onDelete: setRemoving } : {})}
						protectedPaths={["SKILL.md"]}
					/>
				</nav>
			</div>
			<RawFile
				// A new file starts from its own text, not the last file's.
				key={path}
				source={source}
				path={path}
				onDirtyChange={changeDirty}
				onSaved={onSaved}
			/>
			<CancelDialog
				open={pending !== undefined}
				title="Discard unsaved changes?"
				description={`${path} has changes that are not saved. Switching now loses them.`}
				onOpenChange={(next) => {
					if (!next) setPending(undefined);
				}}
				onDiscard={() => {
					changeDirty(false);
					if (pending !== undefined) onPathChange(pending);
					setPending(undefined);
				}}
			/>
			<>
				{source.kind === "editable" && (
					<>
						<SkillDeleteEntryDialog
							entry={removing}
							root={source.root}
							name={source.name}
							onClose={() => setRemoving(undefined)}
							onDeleted={(entry) => {
								setRemoving(undefined);
								if (!entry.folder && entry.path === path) {
									changeDirty(false);
									onPathChange("SKILL.md");
								}
							}}
						/>
						<SkillNewEntryDialog
							open={creating !== undefined}
							kind={creating}
							root={source.root}
							name={source.name}
							files={files.map((file) => file.path)}
							folders={folders}
							onClose={() => setCreating(undefined)}
							onCreated={(created) => {
								setCreating(undefined);
								if (creating === "file") select(created);
							}}
						/>
					</>
				)}
			</>
		</div>
	);
}

function RawFile({
	source,
	path,
	onDirtyChange,
	onSaved,
}: {
	source: RawSource;
	path: string;
	onDirtyChange: (dirty: boolean) => void;
	onSaved: () => void;
}) {
	const query = useRawFile(source, path);
	if (query.isPending) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
				<LoadingState label={`Reading ${path}…`} />
			</div>
		);
	}
	if (query.error !== null) {
		return (
			<div className="min-w-0 flex-1">
				<Notice error={query.error} title={`Cannot open ${path}`} />
			</div>
		);
	}
	if (source.kind === "listed") return <RawPane path={path} text={query.data} />;
	return (
		<EditableFile
			source={source}
			path={path}
			initial={query.data}
			onDirtyChange={onDirtyChange}
			onSaved={onSaved}
		/>
	);
}

function EditableFile({
	source,
	path,
	initial,
	onDirtyChange,
	onSaved,
}: {
	source: Extract<RawSource, { kind: "editable" }>;
	path: string;
	initial: string;
	onDirtyChange: (dirty: boolean) => void;
	onSaved: () => void;
}) {
	const [saved, setSaved] = useState(initial);
	const [text, setText] = useState(initial);
	const dirty = text !== saved;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
	const save = useRawSave(source, path);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
			<RawPane
				path={path}
				text={text}
				onChange={(next) => {
					save.reset();
					setText(next);
				}}
				actions={
					<>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={!dirty || save.isPending}
							onClick={() => {
								save.reset();
								setText(saved);
							}}
						>
							Discard
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={!dirty || save.isPending}
							onClick={() =>
								save.mutate(text, {
									onSuccess: () => {
										setSaved(text);
										if (path === "SKILL.md") onSaved();
									},
								})
							}
						>
							{save.isPending && <Spinner data-icon="inline-start" />}
							Save
						</Button>
					</>
				}
			/>
			{save.error !== null && <Notice error={save.error} />}
		</div>
	);
}
