import type { Json } from "effect/Schema";
import {
	FilePenIcon,
	FileTextIcon,
	SearchIcon,
	SquareTerminalIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ToolRun } from "#domain/conversation/state";
import { argsOf } from "#domain/conversation/tools";
import type { ToolArgs } from "#domain/conversation/tools";
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

/**
 * One tool call, whatever the tool is. The name decides which arguments to read and which
 * body to draw; a name with no renderer falls back to its arguments and output, so a tool
 * is never blank. Main's file, taking the call's arguments from the message the way this
 * branch holds them.
 *
 * A call that made other calls inside itself (codemode's scripts) is not grouped here yet:
 * the wire carries no parent id, so those calls have no card to nest under.
 */

const ICONS = new Map<string, ReactNode>([
	["bash", <TerminalIcon key="bash" />],
	["ls", <SquareTerminalIcon key="ls" />],
	["edit", <FilePenIcon key="edit" />],
	["write", <FilePenIcon key="write" />],
	["read", <FileTextIcon key="read" />],
	["find", <SearchIcon key="find" />],
	["grep", <SearchIcon key="grep" />],
]);

const statusWord = (status: ToolRun["status"] | undefined): string => {
	if (status === "error") return "failed";
	if (status === undefined || status === "running") return "running";
	return "done";
};

const detail = (run: ToolRun | undefined): string => {
	const seconds = run?.durationMs === undefined ? "" : ` (${(run.durationMs / 1000).toFixed(1)}s)`;
	return `${statusWord(run?.status)}${seconds}`;
};

const toolTitle = (name: string, args: ToolArgs | undefined): string => {
	switch (args?.kind) {
		case "bash": {
			const first = args.command.split("\n")[0] ?? "";
			return `${name} ${first}`;
		}
		case "edit":
			return `edit ${args.path}`;
		case "write":
			return `write ${args.path}`;
		case "read":
			return `${name} ${args.path}`;
		default:
			return name;
	}
};

export function ToolTrace({
	name,
	args,
	run,
	open,
	onToggle,
}: {
	name: string;
	/** The call's arguments, from the assistant message that made it. */
	args: Json | undefined;
	/** What the tool has produced so far, or undefined before its first event. */
	run: ToolRun | undefined;
	open: boolean;
	onToggle: () => void;
}) {
	const known = argsOf(name, args);
	const body = toolBody(run, known, args);
	const line = (
		<TraceLine
			status={run?.status === "error" ? "error" : run?.status === "running" ? "running" : undefined}
		>
			<TraceIcon>{ICONS.get(name) ?? <WrenchIcon />}</TraceIcon>
			<TraceTitle>{toolTitle(name, known)}</TraceTitle>
			<TraceDescription>{detail(run)}</TraceDescription>
		</TraceLine>
	);
	if (body === null) return <Trace>{line}</Trace>;
	return (
		<Trace>
			<TraceCollapsible open={open} onOpenChange={() => onToggle()}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent>{body}</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}

function toolBody(
	run: ToolRun | undefined,
	args: ToolArgs | undefined,
	raw: Json | undefined,
): ReactNode {
	const output = run?.output ?? "";
	if (args?.kind === "bash") {
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.command}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">{output || "(no output yet)"}</CodeBlockContent>
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
						<DiffBlock key={index} newText={change.newText} oldText={change.oldText} />
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

	const images = run?.images ?? [];
	if (images.length > 0) {
		return (
			<div className="flex flex-col gap-2">
				{images.map((image, index) => (
					<img
						key={index}
						alt="tool result"
						className="max-h-64 w-auto rounded-lg border"
						src={`data:${image.mimeType};base64,${image.data}`}
					/>
				))}
				{output !== "" && (
					<CodeBlock size="sm">
						<CodeBlockContent className="max-h-64">{output}</CodeBlockContent>
					</CodeBlock>
				)}
			</div>
		);
	}

	const argsText = raw === undefined ? "" : JSON.stringify(raw, null, 2);
	if (argsText === "" && output === "") return null;
	const text = [argsText, output].filter((part) => part !== "").join("\n\n");
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
