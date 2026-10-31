import { ArchiveIcon, FolderOpenIcon, TerminalIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ModeTabs } from "@/components/patterns/tabs/mode-tabs";
import { Notice } from "@/components/patterns/status/notice";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { cn } from "@/lib/cn";

import { archiveProblem, checkFolder, filesOfDrop, filesOfInput, formatBytes } from "./read-folder";
import type { PickedFolder } from "./read-folder";
import type { StageRequest } from "./use-skill-import";

type Kind = (typeof MODES)[number]["value"];

const MODES = [
	{ value: "folder", label: "Folder", icon: FolderOpenIcon },
	{ value: "archive", label: "Archive", icon: ArchiveIcon },
	{ value: "command", label: "Command or URL", icon: TerminalIcon },
] as const;

/** Step one: where the skills come from. Nothing leaves the browser until Continue. */
export function SourceStep({
	onStage,
	onCancel,
	disabled,
	footer,
}: {
	onStage: (request: StageRequest) => void;
	onCancel: () => void;
	disabled: boolean;
	/** The frame's footer element, where Cancel and Continue go. */
	footer: HTMLElement | null;
}) {
	const [kind, setKind] = useState<Kind>("folder");
	const [folder, setFolder] = useState<PickedFolder | undefined>(undefined);
	const [archive, setArchive] = useState<File | undefined>(undefined);
	const [command, setCommand] = useState("");
	const [reading, setReading] = useState(false);
	const [dragging, setDragging] = useState(false);
	const folderInput = useRef<HTMLInputElement>(null);
	const archiveInput = useRef<HTMLInputElement>(null);
	const archiveIssue = archive === undefined ? undefined : archiveProblem(archive);

	const drop = (event: DragEvent) => {
		event.preventDefault();
		setDragging(false);
		setReading(true);
		// Read the entries before the handler yields: the transfer empties after it.
		filesOfDrop(event.dataTransfer)
			.then(setFolder)
			.catch(() => setFolder({ files: [], omitted: [], issues: ["The folder could not be read."] }))
			.finally(() => setReading(false));
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (kind === "folder" && folder !== undefined && folder.issues.length === 0) {
			onStage({ kind: "upload", files: folder.files, omitted: folder.omitted });
		} else if (kind === "archive" && archive !== undefined && archiveIssue === undefined) {
			onStage({ kind: "upload", files: [{ file: archive, path: archive.name }], omitted: [] });
		} else if (kind === "command" && command.trim() !== "") {
			onStage({ kind: "source", input: command.trim() });
		}
	};

	const ready =
		kind === "folder"
			? folder !== undefined && folder.issues.length === 0
			: kind === "archive"
				? archive !== undefined && archiveIssue === undefined
				: command.trim() !== "";

	const bytes = folder?.files.reduce((sum, entry) => sum + entry.file.size, 0) ?? 0;

	return (
		<form
			id="skill-import-form"
			onSubmit={submit}
			className="flex min-h-0 flex-1 flex-col gap-field"
		>
			<ModeTabs items={MODES} value={kind} onValueChange={setKind} />
			<div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
				{kind === "folder" && (
					<>
						<div
							onDragOver={(event) => {
								event.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={drop}
							className={cn(
								"grid justify-items-center gap-2 rounded-xl border border-dashed p-6 text-center text-body transition-colors",
								dragging && "border-primary bg-primary/5",
							)}
						>
							<FolderOpenIcon className="size-6 text-muted-foreground" aria-hidden />
							<p>Drop a skill folder here</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={disabled || reading}
								onClick={() => folderInput.current?.click()}
							>
								Choose folder…
							</Button>
							<input
								ref={(node) => {
									folderInput.current = node;
									node?.setAttribute("webkitdirectory", "");
								}}
								type="file"
								multiple
								hidden
								aria-label="Skill folder"
								onChange={(event) => {
									const list = event.currentTarget.files;
									if (list !== null && list.length > 0) setFolder(checkFolder(filesOfInput(list)));
									event.currentTarget.value = "";
								}}
							/>
						</div>
						{reading ? (
							<LoadingState label="Reading the folder…" />
						) : folder === undefined ? null : (
							<div className="grid gap-1 text-body" aria-live="polite">
								<p>
									{folder.files.length} files, {formatBytes(bytes)}
									{folder.files[0] === undefined
										? ""
										: ` from ${folder.files[0].path.split("/")[0]}`}
								</p>
								{folder.omitted.length > 0 ? (
									<p className="text-muted-foreground">Left out: {folder.omitted.join(", ")}</p>
								) : null}
								{folder.issues.map((issue) => (
									<Notice key={issue} tone="error">
										{issue}
									</Notice>
								))}
							</div>
						)}
					</>
				)}

				{kind === "archive" && (
					<>
						<Field>
							<FieldLabel htmlFor="skill-import-archive">Archive</FieldLabel>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={disabled}
									onClick={() => archiveInput.current?.click()}
								>
									Choose archive…
								</Button>
								<span className="min-w-0 truncate text-body text-muted-foreground">
									{archive === undefined
										? "No file chosen"
										: `${archive.name}, ${formatBytes(archive.size)}`}
								</span>
							</div>
							<input
								ref={archiveInput}
								id="skill-import-archive"
								type="file"
								accept=".zip,.tar,.tar.gz,.tgz"
								hidden
								onChange={(event) => {
									setArchive(event.currentTarget.files?.[0]);
									event.currentTarget.value = "";
								}}
							/>
							<FieldDescription>.zip, .tar, .tar.gz or .tgz</FieldDescription>
						</Field>
						{archiveIssue === undefined ? null : <Notice tone="error">{archiveIssue}</Notice>}
					</>
				)}

				{kind === "command" && (
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="skill-import-command">Command or URL</FieldLabel>
							<Input
								id="skill-import-command"
								value={command}
								onChange={(event) => setCommand(event.target.value)}
								placeholder="npx skills add vercel-labs/agent-skills --skill frontend-design"
								autoComplete="off"
								spellCheck={false}
								className="font-mono"
								disabled={disabled}
							/>
							<FieldDescription>owner/repo, a git URL or a skills add command</FieldDescription>
						</Field>
					</FieldGroup>
				)}
			</div>
			{footer !== null &&
				createPortal(
					<>
						<Button type="button" variant="destructive" onClick={onCancel}>
							Cancel
						</Button>
						<Button type="submit" form="skill-import-form" disabled={disabled || reading || !ready}>
							Continue
						</Button>
					</>,
					footer,
				)}
		</form>
	);
}
