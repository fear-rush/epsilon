/**
 * One tool call, whatever the tool is. The name picks the body; a name with no
 * renderer falls back to its arguments and output, so a tool is never blank
 * (docs/ui.md, Principle 5).
 */
import type { ReactNode } from "react";
import {
	SquareTerminalIcon,
	FilePenIcon,
	FileTextIcon,
	SearchIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import { bashArgsSchema, editArgsSchema, readArgsSchema, writeArgsSchema } from "shared";
import type { ToolRun } from "shared";

import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockTitle,
} from "@/components/ui/code-block";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

const ICONS = new Map<string, ReactNode>([
	["bash", <TerminalIcon key="bash" />],
	["ls", <SquareTerminalIcon key="ls" />],
	["edit", <FilePenIcon key="edit" />],
	["write", <FilePenIcon key="write" />],
	["read", <FileTextIcon key="read" />],
	["find", <SearchIcon key="find" />],
	["grep", <SearchIcon key="grep" />],
]);

const statusWord = (run: ToolRun): string => {
	if (run.status === "error") return "failed";
	if (run.status === "running") return "running";
	if (run.status === "pending") return "not executed";
	return "done";
};

const detail = (run: ToolRun): string => {
	const seconds = run.durationMs === undefined ? "" : ` · ${(run.durationMs / 1000).toFixed(1)}s`;
	return `${statusWord(run)}${seconds}`;
};

export function ToolTrace({ run }: { run: ToolRun }) {
	const body = toolBody(run);
	const line = (
		<TraceLine
			status={run.status === "error" ? "error" : run.status === "running" ? "running" : undefined}
		>
			<TraceIcon>{ICONS.get(run.toolName) ?? <WrenchIcon />}</TraceIcon>
			<TraceTitle>{toolTitle(run)}</TraceTitle>
			<TraceDescription>{detail(run)}</TraceDescription>
		</TraceLine>
	);

	if (body === null) return <Trace>{line}</Trace>;

	return (
		<Trace>
			<TraceCollapsible>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent>{body}</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}

const toolTitle = (run: ToolRun): string => {
	const edit = editArgsSchema.safeParse(run.args);
	if (run.toolName === "edit" && edit.success) return `edit ${edit.data.path}`;
	const write = writeArgsSchema.safeParse(run.args);
	if (run.toolName === "write" && write.success) return `write ${write.data.path}`;
	const read = readArgsSchema.safeParse(run.args);
	if (read.success) return `${run.toolName} ${read.data.path}`;
	const bash = bashArgsSchema.safeParse(run.args);
	if (bash.success) return `bash ${bash.data.command.split("\n")[0] ?? ""}`;
	return run.toolName;
};

function toolBody(run: ToolRun): ReactNode {
	const bash = bashArgsSchema.safeParse(run.args);
	if (bash.success) {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{bash.data.command}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">{run.output || "(no output yet)"}</CodeBlockContent>
			</CodeBlock>
		);
	}

	const edit = editArgsSchema.safeParse(run.args);
	if (edit.success) {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{edit.data.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{edit.data.edits.map((change, index) => (
						<DiffBlock key={index} oldText={change.oldText} newText={change.newText} />
					))}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

	const write = writeArgsSchema.safeParse(run.args);
	if (write.success) {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{write.data.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{write.data.content.split("\n").map((line, index) => (
						<div key={index} className="whitespace-pre-wrap bg-emerald-500/10">
							{`+ ${line}`}
						</div>
					))}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

	if (run.images.length > 0) {
		return (
			<div className="flex flex-col gap-2">
				{run.images.map((image, index) => (
					<img
						key={index}
						alt="tool result"
						className="max-h-64 w-auto rounded-lg border"
						src={`data:${image.mimeType};base64,${image.data}`}
					/>
				))}
				{run.output !== "" && <pre className="whitespace-pre-wrap">{run.output}</pre>}
			</div>
		);
	}

	if (run.output === "" && run.args === undefined) return null;
	return (
		<pre className="whitespace-pre-wrap">
			{run.args === undefined ? "" : JSON.stringify(run.args, null, 2)}
			{run.output === "" ? "" : `\n\n${run.output}`}
		</pre>
	);
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
	return (
		<div>
			{oldText.split("\n").map((line, index) => (
				<div key={`o${index}`} className="whitespace-pre-wrap bg-red-500/10">
					{`- ${line}`}
				</div>
			))}
			{newText.split("\n").map((line, index) => (
				<div key={`n${index}`} className="whitespace-pre-wrap bg-emerald-500/10">
					{`+ ${line}`}
				</div>
			))}
		</div>
	);
}
