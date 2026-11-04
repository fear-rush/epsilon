import { ArchiveIcon, FolderOpenIcon } from "lucide-react";
import { useRef, useState } from "react";

import type { SkillImportCandidate, SkillImportReport } from "#protocol/config/skill-import";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useSettingsProject } from "../../queries.ts";
import { archiveFiles, checkSize, pickedFiles } from "./read-files.ts";
import type { PickedFile } from "./read-files.ts";
import { useSkillImport } from "./use-skill-import.ts";

type Target = "global" | "project";
type Mode = "copy" | "package";

/**
 * Import skills from a repository or folder URL, a picked folder or a zip archive. The
 * server stages the files, checks every skill and reports them; only the chosen ones are
 * committed, into the home's skills or the picked project's `.agents/skills`.
 */
export function ImportSkillsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	if (!open) return null;
	return <ImportBody onOpenChange={onOpenChange} />;
}

function ImportBody({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
	const project = useSettingsProject();
	const im = useSkillImport();
	const [input, setInput] = useState("");
	const [picked, setPicked] = useState<string | undefined>(undefined);
	const [failure, setFailure] = useState<string | undefined>(undefined);
	const folderInput = useRef<HTMLInputElement>(null);
	const archiveInput = useRef<HTMLInputElement>(null);
	const close = (): void => {
		im.discard();
		onOpenChange(false);
	};

	const stageFiles = (files: {
		readonly files: ReadonlyArray<PickedFile>;
		readonly omitted: ReadonlyArray<string>;
	}): void => {
		setFailure(undefined);
		try {
			checkSize(files.files);
		} catch (cause) {
			setFailure(cause instanceof Error ? cause.message : String(cause));
			return;
		}
		setPicked(
			files.omitted.length === 0
				? undefined
				: `${files.omitted.length} ignored files: ${files.omitted.slice(0, 3).join(", ")}`,
		);
		im.stage.mutate({ files: files.files, kind: "upload" });
	};

	if (im.report !== undefined) {
		return (
			<Review
				im={im}
				onBack={() => {
					im.discard();
					setPicked(undefined);
				}}
				onClose={close}
				project={project !== undefined}
				report={im.report}
			/>
		);
	}

	return (
		<DialogFrame
			open
			onOpenChange={(next) => (next ? undefined : close())}
			title="Import skills"
			description="A repository or folder URL, a folder on this machine, or a zip archive. Epsilon stages it and shows what it found before anything is installed."
			size="lg"
			footer={
				<Button variant="destructive" onClick={close}>
					Cancel
				</Button>
			}
		>
			<div className="grid gap-field">
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="skill-import-source">Source</FieldLabel>
						<form
							className="flex gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (input.trim() !== "") {
									im.stage.mutate({ input: input.trim(), kind: "source" });
								}
							}}
						>
							<Input
								id="skill-import-source"
								placeholder="https://github.com/org/skills or ~/code/skill"
								value={input}
								onChange={(event) => setInput(event.target.value)}
							/>
							<Button type="submit" disabled={input.trim() === "" || im.stage.isPending}>
								Stage
							</Button>
						</form>
						<FieldDescription>A repository, or one folder that holds a skill.</FieldDescription>
					</Field>
				</FieldGroup>

				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => folderInput.current?.click()}
						disabled={im.stage.isPending}
					>
						<FolderOpenIcon data-icon="inline-start" />
						Choose a folder
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => archiveInput.current?.click()}
						disabled={im.stage.isPending}
					>
						<ArchiveIcon data-icon="inline-start" />
						Choose a zip
					</Button>
					<input
						ref={folderInput}
						type="file"
						multiple
						hidden
						// @ts-expect-error -- a folder picker is still a non-standard attribute.
						webkitdirectory=""
						onChange={(event) => {
							void pickedFiles(event.target.files).then(stageFiles, (error: Error) => {
								setFailure(error.message);
							});
						}}
					/>
					<input
						ref={archiveInput}
						type="file"
						accept=".zip,application/zip"
						hidden
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file === undefined) return;
							void file.arrayBuffer().then((buffer) => {
								try {
									stageFiles(archiveFiles(new Uint8Array(buffer)));
								} catch (cause) {
									setFailure(cause instanceof Error ? cause.message : String(cause));
								}
								return undefined;
							});
						}}
					/>
				</div>

				{im.stage.isPending && (
					<div className="flex items-center gap-2 text-meta text-muted-foreground">
						<Spinner />
						Reading the source…
					</div>
				)}
				{picked !== undefined && <Notice tone="info">{picked}</Notice>}
				{failure !== undefined && (
					<Notice tone="error" title="The files could not be read">
						{failure}
					</Notice>
				)}
				{im.stage.error !== null && (
					<Notice tone="error" title="The source could not be staged">
						{im.stage.error.message}
					</Notice>
				)}
			</div>
		</DialogFrame>
	);
}

function Review({
	im,
	onBack,
	onClose,
	project,
	report,
}: {
	im: ReturnType<typeof useSkillImport>;
	onBack: () => void;
	onClose: () => void;
	project: boolean;
	report: SkillImportReport;
}) {
	const [chosen, setChosen] = useState<Set<string>>(
		new Set(
			report.candidates.filter((candidate) => candidate.errors.length === 0).map((c) => c.name),
		),
	);
	const [target, setTarget] = useState<Target>(project ? "project" : "global");
	const [mode, setMode] = useState<Mode>("copy");
	const [replace, setReplace] = useState(false);
	const existing = (candidate: SkillImportCandidate): boolean =>
		target === "global" ? candidate.existing.global : candidate.existing.project;
	const toggle = (name: string): void => {
		setChosen((current) => {
			const next = new Set(current);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};
	const selected = report.candidates.filter((candidate) => chosen.has(candidate.name));
	const overwriting = selected.filter(existing);
	const canCommit =
		selected.length > 0 &&
		selected.every((candidate) => candidate.errors.length === 0) &&
		(overwriting.length === 0 || replace) &&
		(mode === "copy" || report.packageOption.available);

	return (
		<DialogFrame
			open
			onOpenChange={(next) => (next ? undefined : onClose())}
			title="Review the import"
			description={`Staged from ${report.source}. Nothing is installed until you commit.`}
			size="lg"
			footer={
				<>
					<Button variant="outline" onClick={onBack}>
						Back
					</Button>
					<Button
						disabled={!canCommit || im.commit.isPending}
						onClick={() =>
							im.commit.mutate(
								{
									mode,
									replace: replace ? overwriting.map((candidate) => candidate.name) : [],
									skills: selected.map((candidate) => candidate.name),
									target,
								},
								{ onSuccess: onClose },
							)
						}
					>
						{im.commit.isPending ? "Installing…" : `Install ${selected.length}`}
					</Button>
				</>
			}
		>
			<div className="grid gap-field">
				<div className="grid gap-1">
					{report.candidates.map((candidate) => (
						<label
							key={candidate.name}
							className="flex items-start gap-2 rounded-lg border p-3 hover:bg-muted/50"
						>
							<Checkbox
								checked={chosen.has(candidate.name)}
								disabled={candidate.errors.length > 0}
								onCheckedChange={() => toggle(candidate.name)}
							/>
							<span className="grid min-w-0 flex-1 gap-1">
								<span className="flex flex-wrap items-center gap-2">
									<span className="truncate text-body font-medium">{candidate.name}</span>
									<Badge variant="outline">
										{candidate.files.length} {candidate.files.length === 1 ? "file" : "files"}
									</Badge>
									{existing(candidate) && <Badge variant="warning">Exists</Badge>}
									{candidate.scripts.length > 0 && <Badge variant="info">Scripts</Badge>}
								</span>
								<span className="text-meta text-muted-foreground">
									{candidate.description === "" ? "No description" : candidate.description}
								</span>
								{candidate.errors.map((issue) => (
									<span key={issue.code} className="text-meta text-destructive">
										{issue.message}
									</span>
								))}
							</span>
						</label>
					))}
				</div>

				<div className="grid gap-2">
					<p className="text-meta font-medium text-muted-foreground">Install into</p>
					<div className="flex gap-2">
						{(["global", "project"] as const).map((value) => (
							<Button
								key={value}
								type="button"
								variant={target === value ? "secondary" : "outline"}
								disabled={value === "project" && !project}
								onClick={() => setTarget(value)}
							>
								{value === "global" ? "Agent home" : "This project"}
							</Button>
						))}
					</div>
					<p className="text-meta font-medium text-muted-foreground">Method</p>
					<div className="flex gap-2">
						<Button
							type="button"
							variant={mode === "copy" ? "secondary" : "outline"}
							onClick={() => setMode("copy")}
						>
							Copy the files
						</Button>
						<Button
							type="button"
							variant={mode === "package" ? "secondary" : "outline"}
							disabled={!report.packageOption.available}
							onClick={() => setMode("package")}
						>
							Install as a package
						</Button>
					</div>
					<FieldDescription>{report.packageOption.reason}</FieldDescription>
				</div>

				{overwriting.length > 0 && (
					<label className="flex items-center gap-2 text-body">
						<Checkbox checked={replace} onCheckedChange={(checked) => setReplace(checked)} />
						Replace {overwriting.map((candidate) => candidate.name).join(", ")}
					</label>
				)}
				{im.commit.error !== null && (
					<Notice tone="error" title="The import was not installed">
						{im.commit.error.message}
					</Notice>
				)}
			</div>
		</DialogFrame>
	);
}
