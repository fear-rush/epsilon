import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { assistantText, assistantThinking } from "#domain/conversation/content";
import { toolRunOf } from "#domain/conversation/selectors";
import type { transcript } from "#domain/conversation/selectors";
import type { ConversationState, StreamingTurn } from "#domain/conversation/state";
import { argsOf } from "#domain/conversation/tools";
import type { AssistantBlock, AssistantEntry } from "#protocol/conversation/frames";
import { Checkpoint } from "@/components/ai-elements/checkpoint";
import { Plan, type PlanStep } from "@/components/ai-elements/plan";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { Markdown } from "@/components/editor/markdown";
import { Tip } from "@/components/patterns/tip";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { imageKeys, occurrenceKeys } from "@/lib/occurrence-keys";

import { changedFilesOf } from "./changed-files";
import { ChangedFiles } from "./changed-files-view";
import { sourcesOf } from "./links";
import { RunCard } from "./run-card";
import { OrphanToolResult, ToolTrace, stepStatusOf, toolTitle } from "./tool-trace";
import { assistantRowPropsEqual, rowPropsEqual } from "./transcript-row-equal";

/** pi's own word for the label that stands in for thinking it hides. */
const DEFAULT_HIDDEN_THINKING_LABEL = "Thinking...";

export type TranscriptRow = ReturnType<typeof transcript>[number];

type ToolCallBlock = Extract<AssistantBlock, { type: "toolCall" }>;

/** Memoized: a settled row does not draw again while another streams. */
export const Row = memo(function Row({
	row,
	state,
	toolOpen,
	onToggleTool,
}: {
	row: TranscriptRow;
	state: ConversationState;
	toolOpen: ReadonlyMap<string, boolean>;
	onToggleTool: (toolCallId: string) => void;
}) {
	if (row.kind === "streaming") return <StreamingRow turn={row.turn} />;
	if (row.kind === "run") {
		return <RunCard row={row} toolOpen={toolOpen} onToggleTool={onToggleTool} />;
	}
	const { entry } = row;
	switch (entry.role) {
		case "user": {
			const keys = imageKeys(entry.images);
			return (
				<Message align="end">
					<MessageContent>
						<Bubble align="end" variant="muted">
							<BubbleContent>
								{entry.images.map((image, index) => (
									<img
										key={keys[index]}
										alt="attached"
										className="mb-2 max-h-48 rounded-control"
										src={`data:${image.mimeType};base64,${image.data}`}
									/>
								))}
								<p className="text-body whitespace-pre-wrap">{entry.text}</p>
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);
		}
		case "assistant":
			return (
				<AssistantRow entry={entry} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
			);
		case "toolResult": {
			// The tool card beside the call already shows this output; only a result whose
			// call is outside the window stands on its own.
			if (toolRunOf(state, entry.toolCallId) !== undefined) return null;
			return (
				<OrphanToolResult name={entry.toolName} output={entry.output} isError={entry.isError} />
			);
		}
		case "summary":
			// pi's own block where it replaced the history: the label says how much, the
			// text is the summary, and it stays where it happened.
			return (
				<>
					<Checkpoint label={entry.label} />
					<p className="max-h-64 overflow-auto px-1 text-meta whitespace-pre-wrap text-muted-foreground">
						{entry.text}
					</p>
				</>
			);
		default: {
			const unreachable: never = entry;
			return unreachable;
		}
	}
}, rowPropsEqual);

function CopyReply({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), 2000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [copied]);

	const label = copied ? "Copied" : "Copy reply";
	return (
		<>
			<Tip label={label}>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={label}
					onClick={() => {
						void navigator.clipboard.writeText(text).then(
							() => setCopied(true),
							() => {},
						);
					}}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</Tip>
			<span aria-live="polite" className="sr-only">
				{copied ? "Copied" : ""}
			</span>
		</>
	);
}

const AssistantRow = memo(function AssistantRow({
	entry,
	state,
	toolOpen,
	onToggleTool,
}: {
	entry: AssistantEntry;
	state: ConversationState;
	toolOpen: ReadonlyMap<string, boolean>;
	onToggleTool: (toolCallId: string) => void;
}) {
	const text = assistantText(entry);
	const thinking = assistantThinking(entry);
	const calls = entry.blocks.filter((block): block is ToolCallBlock => block.type === "toolCall");
	// A message that only called tools still has a row: its calls are what it said.
	const silent = text === "" && thinking === "" && calls.length === 0;
	if (silent) return null;

	const runs = calls.map((call) => toolRunOf(state, call.toolCallId));
	const failed = runs.filter((run) => run?.status === "error").length;
	const count = calls.length;
	const steps: PlanStep[] = calls.map((call, index) => ({
		key: call.toolCallId,
		status: stepStatusOf(runs[index]),
		title: toolTitle(call.toolName, argsOf(call.toolName, call.args)),
	}));
	const sources = sourcesOf(text);
	const changed = changedFilesOf(entry);
	const reasoning =
		thinking === "" ? undefined : (
			<Reasoning
				text={state.hideThinking ? "" : thinking}
				hidden={state.hideThinking}
				label={
					state.hideThinking
						? (state.hiddenThinkingLabel ?? DEFAULT_HIDDEN_THINKING_LABEL)
						: undefined
				}
				running={false}
			/>
		);
	const tools = calls.map((call) => (
		<ToolTrace
			key={call.toolCallId}
			args={call.args}
			name={call.toolName}
			open={toolOpen.get(call.toolCallId)}
			run={toolRunOf(state, call.toolCallId)}
			onToggle={() => onToggleTool(call.toolCallId)}
		/>
	));
	// This row wrote text, so it is not part of a run: the prose is the reader's boundary.
	// Its calls stay here, as lines, rather than folding behind a heading that would sit
	// above the answer.
	const stepsContent = (
		<>
			{reasoning}
			{count > 1 ? <Plan title="Plan" steps={steps} defaultOpen={failed > 0} /> : undefined}
			{tools}
		</>
	);

	return (
		<Message>
			<MessageContent className="gap-3">
				{stepsContent}
				{text !== "" && (
					<div className="text-body">
						<Markdown links="citation">{text}</Markdown>
					</div>
				)}
				{sources.length > 0 ? <Sources sources={sources} /> : undefined}
				<ChangedFiles files={changed} />
				{text === "" || count > 0 ? undefined : (
					<MessageFooter className="px-0">
						<CopyReply text={text} />
					</MessageFooter>
				)}
			</MessageContent>
		</Message>
	);
}, assistantRowPropsEqual);

function StreamingRow({ turn }: { turn: StreamingTurn }) {
	// A streaming block has no id of its own: its kind and how many of that kind came before.
	const blockKeys = occurrenceKeys(turn.blocks.map((block) => block?.kind ?? "gap"));
	return (
		<Message>
			<MessageContent className="gap-3 text-body">
				{turn.blocks.map((block, index) =>
					block === undefined ? null : block.kind === "thinking" ? (
						<Reasoning key={blockKeys[index]} text={block.text} running />
					) : (
						<p key={blockKeys[index]} className="whitespace-pre-wrap">
							{block.text}
						</p>
					),
				)}
				<span className="animate-pulse text-muted-foreground motion-reduce:animate-none">▍</span>
			</MessageContent>
		</Message>
	);
}
