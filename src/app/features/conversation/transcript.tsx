import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { assistantText, assistantThinking } from "#domain/conversation/content";
import { toolRunOf, transcript } from "#domain/conversation/selectors";
import type { ConversationState, StreamingTurn, ToolRun } from "#domain/conversation/state";
import type { AssistantEntry, TranscriptEntry } from "#protocol/conversation/frames";
import { Markdown } from "@/components/editor/markdown";
import { cn } from "@/lib/cn";

/**
 * The conversation, virtualized.
 *
 * Only the rows near the viewport are mounted, so a 50,000-entry chat opens as fast as a
 * short one. Rows are keyed by entry id, never by position, so an older page arriving at
 * the top does not renumber what is already on screen. Scrolling to the top asks for that
 * page; the transcript keeps its place because the rows below keep their keys.
 */
export function Transcript({
	state,
	onLoadOlder,
}: {
	state: ConversationState;
	onLoadOlder: () => void;
}) {
	const rows = transcript(state);
	const scroll = useRef<HTMLDivElement>(null);
	// The virtualizer is an external store with imperative measurement; memoizing it is
	// neither possible nor wanted, which is exactly what this component should not do.
	// oxlint-disable-next-line react/incompatible-library
	const virtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: () => 88,
		getScrollElement: () => scroll.current,
		overscan: 8,
	});

	const stick = useRef(true);

	// A chat opens on its newest row. A reader who scrolled up stays where they are.
	useEffect(() => {
		const element = scroll.current;
		if (element === null || !stick.current) return;
		element.scrollTop = element.scrollHeight;
	}, [rows.length]);

	// Holding at the top keeps pulling: one page arrives, the reader is still at the top,
	// so the next page is asked for. A 5,000-entry chat reaches its first message this way.
	useEffect(() => {
		const element = scroll.current;
		if (element !== null && element.scrollTop < 160) onLoadOlder();
	}, [rows.length, state.hasOlder, onLoadOlder]);

	const onScroll = (): void => {
		const element = scroll.current;
		if (element === null) return;
		stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
		if (element.scrollTop < 160) onLoadOlder();
	};

	return (
		<div
			ref={scroll}
			role="log"
			aria-label="Conversation"
			onScroll={onScroll}
			className="min-h-0 flex-1 overflow-y-auto px-page"
		>
			<div
				className="relative mx-auto w-full max-w-content"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((item) => {
					const row = rows[item.index];
					if (row === undefined) return null;
					return (
						<div
							key={item.key}
							ref={virtualizer.measureElement}
							data-index={item.index}
							className="absolute inset-x-0 top-0 py-2"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							{row.kind === "entry" ? (
								<Row entry={row.entry} state={state} />
							) : (
								<StreamingRow turn={row.turn} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function Row({ entry, state }: { entry: TranscriptEntry; state: ConversationState }) {
	switch (entry.role) {
		case "user":
			return (
				<div className="ml-auto w-fit max-w-xl rounded-xl bg-muted px-3 py-2">
					<p className="text-body whitespace-pre-wrap">{entry.text}</p>
				</div>
			);
		case "assistant":
			return <AssistantRow entry={entry} state={state} />;
		case "toolResult": {
			// The tool card beside the call already shows this output; only a result whose
			// call is outside the window stands on its own.
			if (toolRunOf(state, entry.toolCallId) !== undefined) return null;
			return <ToolOutput output={entry.output} isError={entry.isError} />;
		}
		default: {
			const unreachable: never = entry;
			return unreachable;
		}
	}
}

function AssistantRow({ entry, state }: { entry: AssistantEntry; state: ConversationState }) {
	const text = assistantText(entry);
	const thinking = assistantThinking(entry);
	return (
		<div className={cn("grid gap-2", text === "" && thinking === "" && "hidden")}>
			{thinking !== "" && (
				<details className="text-meta text-muted-foreground">
					<summary className="cursor-pointer select-none">Thinking</summary>
					<p className="mt-1 whitespace-pre-wrap">{thinking}</p>
				</details>
			)}
			{text !== "" && (
				<div className="text-body">
					<Markdown>{text}</Markdown>
				</div>
			)}
			{entry.blocks.map((block) =>
				block.type === "toolCall" ? (
					<ToolCard
						key={block.toolCallId}
						name={block.toolName}
						run={toolRunOf(state, block.toolCallId)}
					/>
				) : null,
			)}
		</div>
	);
}

function StreamingRow({ turn }: { turn: StreamingTurn }) {
	return (
		<div className="grid gap-2 text-body">
			{turn.blocks.map((block, index) =>
				block === undefined ? null : block.kind === "thinking" ? (
					// A streaming block is its index in the turn; it has no id of its own.
					// oxlint-disable-next-line react/no-array-index-key
					<p key={index} className="text-meta whitespace-pre-wrap text-muted-foreground">
						{block.text}
					</p>
				) : (
					// oxlint-disable-next-line react/no-array-index-key
					<p key={index} className="whitespace-pre-wrap">
						{block.text}
					</p>
				),
			)}
		</div>
	);
}

function ToolCard({ name, run }: { name: string; run: ToolRun | undefined }) {
	return (
		<div className="rounded-lg border bg-card px-3 py-2 text-meta">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium">{name}</span>
				<span
					className={cn("text-muted-foreground", run?.status === "error" && "text-destructive")}
				>
					{run?.status ?? "running"}
					{run?.durationMs === undefined ? "" : ` · ${Math.round(run.durationMs)} ms`}
				</span>
			</div>
			{run !== undefined && run.output !== "" && (
				<pre className="mt-1 max-h-48 overflow-auto text-code break-words whitespace-pre-wrap text-muted-foreground">
					{run.output}
				</pre>
			)}
		</div>
	);
}

function ToolOutput({ output, isError }: { output: string; isError: boolean }) {
	if (output === "") return null;
	return (
		<pre
			className={cn(
				"overflow-auto rounded-lg border bg-card px-3 py-2 text-code break-words whitespace-pre-wrap",
				isError ? "text-destructive" : "text-muted-foreground",
			)}
		>
			{output}
		</pre>
	);
}
