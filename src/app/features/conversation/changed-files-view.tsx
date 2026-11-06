import { FilesIcon } from "lucide-react";
import { useState } from "react";

import { FileTree } from "@/components/ai-elements/file-tree";
import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "@/components/ui/code-block";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";
import { occurrenceKeys } from "@/lib/occurrence-keys";

import type { ChangedFile } from "./changed-files";

/** One edit's lines, removed then added, the way a diff reads. */
const linesOf = (text: string) => text.split("\n").filter((line) => line !== "");

function DiffLines({ file }: { file: ChangedFile }) {
	const rows = file.edits.flatMap((edit) => [
		...linesOf(edit.oldText).map((line) => ({ variant: "removed" as const, line })),
		...linesOf(edit.newText).map((line) => ({ variant: "added" as const, line })),
	]);
	const keys = occurrenceKeys(rows.map((row) => `${row.variant}-${row.line}`));
	return (
		<>
			{rows.map((row, at) => (
				<CodeBlockLine key={keys[at]} variant={row.variant}>
					{row.line}
				</CodeBlockLine>
			))}
		</>
	);
}

/**
 * The files one reply changed, as a folder tree with the selected file's diff under it.
 * A single changed file already has its own Tool card, so this appears only when a reply
 * touched more than one: the tree is what a reader scans, and the diff is what they read.
 */
export function ChangedFiles({ files }: { files: ReadonlyArray<ChangedFile> }) {
	const [selected, setSelected] = useState<string | undefined>(files[0]?.path);
	if (files.length < 2) return null;
	const current = files.find((file) => file.path === selected) ?? files[0];
	if (current === undefined) return null;

	return (
		<Trace>
			<TraceCollapsible>
				<TraceCollapsibleTrigger>
					<TraceLine>
						<TraceIcon>
							<FilesIcon />
						</TraceIcon>
						<TraceTitle>Changed {files.length} files</TraceTitle>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<div className="flex min-w-0 flex-col gap-2">
						<FileTree
							files={files.map((file) => ({ path: file.path }))}
							selected={current.path}
							label="Changed files"
							onSelect={setSelected}
						/>
						<CodeBlock size="sm">
							<CodeBlockHeader>
								<CodeBlockTitle>{current.path}</CodeBlockTitle>
							</CodeBlockHeader>
							<CodeBlockContent className="max-h-64">
								<DiffLines file={current} />
							</CodeBlockContent>
						</CodeBlock>
					</div>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
