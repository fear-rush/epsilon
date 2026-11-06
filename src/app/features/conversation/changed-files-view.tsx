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

import type { ChangedFile } from "./changed-files";

/** One edit's lines, removed then added, the way a diff reads. */
function DiffLines({ file }: { file: ChangedFile }) {
	return (
		<>
			{file.edits.flatMap((edit, editIndex) => [
				...edit.oldText
					.split("\n")
					.filter((line) => line !== "")
					.map((line, lineIndex) => (
						<CodeBlockLine
							// An edit carries no id; its position in the call and the line's position identify it.
							// oxlint-disable-next-line react/no-array-index-key
							key={`old-${editIndex}-${lineIndex}`}
							variant="removed"
						>
							{line}
						</CodeBlockLine>
					)),
				...edit.newText
					.split("\n")
					.filter((line) => line !== "")
					.map((line, lineIndex) => (
						<CodeBlockLine
							// oxlint-disable-next-line react/no-array-index-key
							key={`new-${editIndex}-${lineIndex}`}
							variant="added"
						>
							{line}
						</CodeBlockLine>
					)),
			])}
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
