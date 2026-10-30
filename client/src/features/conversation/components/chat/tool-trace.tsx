/**
 * One tool call, whatever the tool is. The name decides which arguments to read
 * and which body to draw; a name with no renderer falls back to its arguments and
 * output, so a tool is never blank (docs/ARCHITECTURE.md, UI rules: one way to render a tool call).
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
	CodeBlockLine,
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

/** The arguments of a known tool, read through the schema for that tool only. */
type ToolArgs =
	| { kind: "bash"; command: string }
	| { kind: "edit"; path: string; edits: { oldText: string; newText: string }[] }
	| { kind: "write"; path: string; content: string }
	| { kind: "read"; path: string };

const argsOf = (run: ToolRun): ToolArgs | undefined => {
	switch (run.toolName) {
		case "bash":
		case "ls": {
			const parsed = bashArgsSchema.safeParse(run.args);
			return parsed.success ? { kind: "bash", command: parsed.data.command } : undefined;
		}
		case "edit": {
			const parsed = editArgsSchema.safeParse(run.args);
			return parsed.success
				? { kind: "edit", path: parsed.data.path, edits: parsed.data.edits }
				: undefined;
		}
		case "write": {
			const parsed = writeArgsSchema.safeParse(run.args);
			return parsed.success
				? { kind: "write", path: parsed.data.path, content: parsed.data.content }
				: undefined;
		}
		case "read":
		case "find":
		case "grep": {
			const parsed = readArgsSchema.safeParse(run.args);
			return parsed.success ? { kind: "read", path: parsed.data.path } : undefined;
		}
		default:
			return undefined;
	}
};

const statusWord = (run: ToolRun): string => {
	if (run.status === "error") return "failed";
	if (run.status === "running") return "running";
	if (run.status === "pending") return "not executed";
	return "done";
};

const detail = (run: ToolRun): string => {
	const seconds = run.durationMs === undefined ? "" : ` (${(run.durationMs / 1000).toFixed(1)}s)`;
	return `${statusWord(run)}${seconds}`;
};

const toolTitle = (run: ToolRun, args: ToolArgs | undefined): string => {
	switch (args?.kind) {
		case "bash": {
			const first = args.command.split("\n")[0] ?? "";
			return `${run.toolName} ${first}`;
		}
		case "edit":
			return `edit ${args.path}`;
		case "write":
			return `write ${args.path}`;
		case "read":
			return `${run.toolName} ${args.path}`;
		default:
			return run.toolName;
	}
};

export function ToolTrace({ run }: { run: ToolRun }) {
	const args = argsOf(run);
	const body = toolBody(run, args);
	const line = (
		<TraceLine
			status={run.status === "error" ? "error" : run.status === "running" ? "running" : undefined}
		>
			<TraceIcon>{ICONS.get(run.toolName) ?? <WrenchIcon />}</TraceIcon>
			<TraceTitle>{toolTitle(run, args)}</TraceTitle>
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

function toolBody(run: ToolRun, args: ToolArgs | undefined): ReactNode {
	if (args?.kind === "bash") {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.command}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">{run.output || "(no output yet)"}</CodeBlockContent>
			</CodeBlock>
		);
	}

	if (args?.kind === "edit") {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{args.edits.map((change, index) => (
						<DiffBlock key={index} oldText={change.oldText} newText={change.newText} />
					))}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

	if (args?.kind === "write") {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{args.content.split("\n").map((line, index) => (
						<CodeBlockLine key={index} variant="added">
							{line}
						</CodeBlockLine>
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
				{run.output !== "" && (
					<CodeBlock size="sm">
						<CodeBlockContent className="max-h-64">{run.output}</CodeBlockContent>
					</CodeBlock>
				)}
			</div>
		);
	}

	if (run.output === "" && run.args === undefined) return null;
	const text = [run.args === undefined ? "" : JSON.stringify(run.args, null, 2), run.output]
		.filter((part) => part !== "")
		.join("\n\n");
	return (
		<CodeBlock size="sm">
			<CodeBlockContent className="max-h-64">{text}</CodeBlockContent>
		</CodeBlock>
	);
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
	return (
		<>
			{oldText.split("\n").map((line, index) => (
				<CodeBlockLine key={`o${index}`} variant="removed">
					{line}
				</CodeBlockLine>
			))}
			{newText.split("\n").map((line, index) => (
				<CodeBlockLine key={`n${index}`} variant="added">
					{line}
				</CodeBlockLine>
			))}
		</>
	);
}
