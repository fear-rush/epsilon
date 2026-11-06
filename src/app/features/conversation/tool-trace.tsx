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
import { StackTrace } from "@/components/ai-elements/stack-trace";
import type { StepStatus } from "@/components/ai-elements/status-icon";
import { Subagent, type SubagentCall } from "@/components/ai-elements/subagent";
import { Terminal } from "@/components/ai-elements/terminal";
import { TestResults } from "@/components/ai-elements/test-results";
import { Tool } from "@/components/ai-elements/tool";
import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "@/components/ui/code-block";
import { imageKeys, occurrenceKeys } from "@/lib/occurrence-keys";

import { stackTraceOf } from "./stack";
import { testResultsOf } from "./test-results";

/**
 * One tool call, whatever the tool is. The name decides which arguments to read and which
 * element draws the result: Terminal for a shell command, Test Results for a test run,
 * Stack Trace for a failure, Subagent for the calls a tool made inside itself, and Tool for
 * everything else. A name with no renderer still falls back to its arguments and output,
 * so a tool is never blank.
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

/** The line's word for a run, and the duration a finished one took. */
const statusWord = (status: ToolRun["status"] | undefined): string => {
	if (status === "error") return "failed";
	if (status === undefined || status === "running") return "running";
	return "done";
};

const detail = (run: ToolRun | undefined): string => {
	const seconds = run?.durationMs === undefined ? "" : ` (${(run.durationMs / 1000).toFixed(1)}s)`;
	const words = `${statusWord(run?.status)}${seconds}`;
	return run?.note === undefined ? words : `${words}: ${run.note}`;
};

/** The one-line detail a nested call shows inside its subagent. */
const nestedDetail = (child: ToolRun): string => {
	const seconds =
		child.durationMs === undefined ? "" : ` (${(child.durationMs / 1000).toFixed(1)}s)`;
	const status = statusWord(child.status);
	const first = child.output.split("\n")[0]?.trim() ?? "";
	return first === "" ? `${status}${seconds}` : `${status}${seconds}: ${first}`;
};

const nestedStatus = (status: ToolRun["status"]): StepStatus => {
	if (status === "running") return "running";
	if (status === "error") return "error";
	return "done";
};

/** The step state a plan or a task draws for one run. A call with no run yet is pending. */
export const stepStatusOf = (run: ToolRun | undefined): StepStatus => {
	if (run === undefined) return "pending";
	return nestedStatus(run.status);
};

/** The words a tool call's line uses when it has arguments worth reading. */
export const toolTitle = (name: string, args: ToolArgs | undefined): string => {
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
	/** A choice the chat remembers; undefined lets the element pick its own default. */
	open: boolean | undefined;
	onToggle: () => void;
}) {
	const known = argsOf(name, args);
	const output = run?.output ?? "";
	const children = run?.children ?? [];
	const status: "running" | "error" | undefined =
		run?.status === "error" ? "error" : run?.status === "running" ? "running" : undefined;

	// A failed call that printed a stack gets the frames, whatever tool it was.
	if (run?.status === "error") {
		const stack = stackTraceOf(output);
		if (stack !== undefined) {
			return <StackTrace stack={stack} open={open} onOpenChange={() => onToggle()} />;
		}
	}

	if (known?.kind === "bash") {
		const results = run?.status === "running" ? undefined : testResultsOf(known.command, output);
		if (results !== undefined) {
			return <TestResults summary={results} open={open} onOpenChange={() => onToggle()} />;
		}
		return (
			<Terminal
				command={known.command}
				output={output}
				running={run?.status === "running"}
				failed={run?.status === "error"}
				description={detail(run)}
				open={open}
				onOpenChange={() => onToggle()}
			/>
		);
	}

	if (children.length > 0) {
		const calls: SubagentCall[] = children.map((child) => ({
			detail: nestedDetail(child),
			key: child.toolCallId,
			name: child.toolName,
			status: nestedStatus(child.status),
		}));
		return (
			<Subagent
				name={name}
				noun={name === "codemode" ? "script" : "subagent"}
				status={status}
				calls={calls}
				open={open}
				onOpenChange={() => onToggle()}
			>
				{output === "" ? undefined : (
					<CodeBlock size="sm">
						<CodeBlockContent wrap className="max-h-64">
							{output}
						</CodeBlockContent>
					</CodeBlock>
				)}
			</Subagent>
		);
	}

	return (
		<Tool
			title={toolTitle(name, known)}
			icon={ICONS.get(name) ?? <WrenchIcon />}
			status={status}
			description={detail(run)}
			open={open}
			onOpenChange={() => onToggle()}
		>
			{toolBody(run, known, args)}
		</Tool>
	);
}

/** A tool result whose call is outside the window: the output stands on its own. */
export function OrphanToolResult({
	name,
	output,
	isError,
}: {
	name: string;
	output: string;
	isError: boolean;
}) {
	if (isError) {
		const stack = stackTraceOf(output);
		if (stack !== undefined) return <StackTrace stack={stack} />;
	}
	return (
		<Tool
			title={name}
			icon={ICONS.get(name) ?? <WrenchIcon />}
			status={isError ? "error" : undefined}
			description={isError ? "failed" : "done"}
		>
			{output === "" ? undefined : (
				<CodeBlock size="sm" variant={isError ? "destructive" : "default"}>
					<CodeBlockContent wrap className="max-h-64">
						{output}
					</CodeBlockContent>
				</CodeBlock>
			)}
		</Tool>
	);
}

function toolBody(
	run: ToolRun | undefined,
	args: ToolArgs | undefined,
	raw: Json | undefined,
): ReactNode {
	const output = run?.output ?? "";
	const variant = run?.status === "error" ? "destructive" : "default";

	// A call that failed says why; its intended change is not worth reading over the error.
	if (run?.status === "error" && output !== "") {
		return (
			<CodeBlock size="sm" variant={variant}>
				<CodeBlockContent wrap className="max-h-64">
					{output}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

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
		const editKeys = occurrenceKeys(
			args.edits.map((change) => `${change.oldText}\n${change.newText}`),
		);
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{args.edits.map((change, index) => (
						<DiffBlock key={editKeys[index]} newText={change.newText} oldText={change.oldText} />
					))}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

	if (args?.kind === "write") {
		const writeLines = args.content.split("\n");
		const writeKeys = occurrenceKeys(writeLines);
		return (
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>{args.path}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent className="max-h-64">
					{writeLines.map((line, index) => (
						<CodeBlockLine key={writeKeys[index]} variant="added">
							{line}
						</CodeBlockLine>
					))}
				</CodeBlockContent>
			</CodeBlock>
		);
	}

	const images = run?.images ?? [];
	if (images.length > 0) {
		const keys = imageKeys(images);
		return (
			<div className="flex flex-col gap-2">
				{images.map((image, index) => (
					<img
						key={keys[index]}
						alt="tool result"
						className="max-h-64 w-auto rounded-control border"
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
	if (argsText === "" && output === "") return undefined;
	const text = [argsText, output].filter((part) => part !== "").join("\n\n");
	return (
		<CodeBlock size="sm" variant={variant}>
			<CodeBlockContent wrap className="max-h-64">
				{text}
			</CodeBlockContent>
		</CodeBlock>
	);
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const oldKeys = occurrenceKeys(oldLines);
	const newKeys = occurrenceKeys(newLines);
	return (
		<>
			{oldLines.map((line, index) => (
				<CodeBlockLine key={`o${oldKeys[index]}`} variant="removed">
					{line}
				</CodeBlockLine>
			))}
			{newLines.map((line, index) => (
				<CodeBlockLine key={`n${newKeys[index]}`} variant="added">
					{line}
				</CodeBlockLine>
			))}
		</>
	);
}
