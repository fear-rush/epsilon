import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckIcon, ChevronsDownIcon, ChevronsUpIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { assistantText, assistantThinking, entryLabel } from "#domain/conversation/content";
import { toolRunOf, transcript } from "#domain/conversation/selectors";
import type { ConversationState, StreamingTurn } from "#domain/conversation/state";
import { argsOf } from "#domain/conversation/tools";
import type { SnapshotTreeNode } from "#domain/conversation/tree";
import type {
	AssistantBlock,
	AssistantEntry,
	TranscriptEntry,
} from "#protocol/conversation/frames";
import { ChainOfThought } from "@/components/ai-elements/chain-of-thought";
import { Checkpoint } from "@/components/ai-elements/checkpoint";
import { Plan, type PlanStep } from "@/components/ai-elements/plan";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { Markdown } from "@/components/editor/markdown";
import { Tip } from "@/components/patterns/tip";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { cn } from "@/lib/cn";

import { changedFilesOf } from "./changed-files";
import { ChangedFiles } from "./changed-files-view";
import { sourcesOf } from "./links";
import { OrphanToolResult, ToolTrace, stepStatusOf, toolTitle } from "./tool-trace";

/**
 * The conversation.
 *
 * A short chat renders every row; above ~150 rows only the rows near the viewport are
 * mounted, so a 50,000-entry chat still opens quickly and Ctrl+F keeps working where it
 * matters. Rows are keyed by entry id, never by position, so an older page arriving at the
 * top does not renumber what is on screen. The virtualizer owns scrolling: `anchorTo: "end"`
 * keeps the view still while older pages prepend, and `followOnAppend` follows a reply only
 * when the reader is already at the end.
 *
 * Sending is the one time the page moves on purpose: the sent message scrolls to the top of
 * the view and the reply grows below it (R9).
 */

/** Below this many rows every row is mounted; above it, virtualization starts. */
const VIRTUALIZE_ABOVE = 150;

/** A row's starting height, by what it holds. The virtualizer measures after mounting. */
const ESTIMATE: Record<TranscriptEntry["role"] | "streaming", number> = {
	assistant: 240,
	streaming: 120,
	summary: 160,
	toolResult: 44,
	user: 72,
};

/** pi's own word for the label that stands in for thinking it hides. */
const DEFAULT_HIDDEN_THINKING_LABEL = "Thinking...";

/** The rail's five-slot viewport: as many dots as one screenful should hold. */
const RAIL_SLOTS = 5;
/** One line and a readable length, for a dot's label and tooltip. */
const PREVIEW_LENGTH = 80;

const GAP = 24;
const PADDING = 32;
const END_THRESHOLD = 48;

export type TranscriptRow = ReturnType<typeof transcript>[number];

/** The text a search can find in one row. */
export const rowText = (row: TranscriptRow): string => {
	if (row.kind === "entry") return entryLabel(row.entry);
	return row.turn.blocks.map((block) => block?.text ?? "").join(" ");
};

/** The ids of the rows whose text contains `query`, in display order. */
export const matchingRowIds = (
	rows: ReadonlyArray<TranscriptRow>,
	query: string,
): ReadonlyArray<string> => {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	return rows.filter((row) => rowText(row).toLowerCase().includes(needle)).map((row) => row.id);
};

const previewOf = (text: string): string => {
	const line = text.trimStart().split("\n")[0]?.trim() ?? "";
	return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/** The active branch's user messages in tree order, for a rail wider than the window. */
const treeUserRows = (
	tree: ReadonlyArray<SnapshotTreeNode>,
): ReadonlyArray<{ readonly id: string; readonly text: string }> => {
	const users: Array<{ id: string; text: string }> = [];
	const stack = [...tree].toReversed();
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) continue;
		if (node.kind === "user" && node.active) users.push({ id: node.entryId, text: node.text });
		for (let index = node.children.length - 1; index >= 0; index -= 1) {
			const child = node.children[index];
			if (child !== undefined) stack.push(child);
		}
	}
	return users;
};

/**
 * The quick jump rail: a five-slot viewport that scrolls through one dot per user message
 * at the transcript's left edge. It owns a gutter beside the scroller rather than sitting
 * over it, so a wide tool result never runs under the dots. The viewport follows the
 * current turn, the chevrons jump to the ends, and it stays faint until used. A chat with
 * fewer than five user turns has none: there is too little to navigate.
 */
function TranscriptRail({
	rows,
	activeId,
	onJump,
	onJumpEnd,
}: {
	rows: ReadonlyArray<{ id: string; text: string }>;
	activeId: string | undefined;
	onJump: (id: string) => void;
	onJumpEnd: () => void;
}) {
	const railRef = useRef<HTMLDivElement>(null);
	const anchored = rows.findIndex((row) => row.id === activeId);
	const activeIndex = anchored === -1 ? rows.length - 1 : anchored;

	useEffect(() => {
		const viewport = railRef.current;
		if (viewport === null) return;
		const slot = viewport.clientHeight / RAIL_SLOTS;
		const firstVisible = Math.round(viewport.scrollTop / slot);
		const target =
			activeIndex < firstVisible + 1
				? activeIndex - 1
				: activeIndex > firstVisible + RAIL_SLOTS - 2
					? activeIndex - (RAIL_SLOTS - 2)
					: firstVisible;
		const lastStart = Math.max(0, rows.length - RAIL_SLOTS);
		// The rail is an overview, not a second scroll surface: it follows the reader at once.
		// A smooth scroll over a long chat would chase for seconds and hide the active dot
		// outside the five-slot window while it moved.
		viewport.scrollTop = Math.max(0, Math.min(target, lastStart)) * slot;
	}, [activeIndex, rows.length]);

	if (rows.length < RAIL_SLOTS) return null;
	const first = rows[0];

	return (
		<div className="hidden w-8 shrink-0 items-center justify-center pl-1 sm:flex">
			<nav
				aria-label="Jump to a message"
				className="flex flex-col items-center opacity-40 transition-all duration-base focus-within:opacity-100 hover:opacity-100 starting:scale-95 starting:opacity-0"
			>
				<Tip label="First message">
					<button
						type="button"
						aria-label="Go to the first message"
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
						onClick={() => {
							if (first !== undefined) onJump(first.id);
						}}
					>
						<ChevronsUpIcon className="size-3.5" />
					</button>
				</Tip>
				<div
					ref={railRef}
					data-rail-viewport="true"
					className="relative scrollbar-none h-80 w-6 overflow-y-auto overscroll-contain"
				>
					<div className="relative flex flex-col items-center">
						<span
							aria-hidden
							className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
						/>
						{rows.map((row, index) => {
							const preview = previewOf(row.text) || `Message ${index + 1}`;
							const active = index === activeIndex;
							return (
								<Tip key={row.id} label={`${index + 1}. ${preview}`}>
									<button
										type="button"
										aria-label={`Go to message ${index + 1}: ${preview}`}
										aria-current={active ? "step" : undefined}
										className="relative flex h-16 w-6 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
										onClick={() => onJump(row.id)}
									>
										<span
											className={cn(
												"size-1.5 rounded-full",
												active ? "opacity-0" : "bg-muted-foreground/35",
											)}
										/>
									</button>
								</Tip>
							);
						})}
						<span
							aria-hidden
							data-rail-active="true"
							className="pointer-events-none absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70"
							style={{ top: `${((activeIndex + 0.5) / rows.length) * 100}%` }}
						/>
					</div>
				</div>
				<Tip label="Last message">
					<button
						type="button"
						aria-label="Go to the last message"
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
						onClick={onJumpEnd}
					>
						<ChevronsDownIcon className="size-3.5" />
					</button>
				</Tip>
			</nav>
		</div>
	);
}

export type Jump = { readonly id: string; readonly nonce: number };

export function Transcript({
	state,
	onLoadOlder,
	onLoadTree,
	anchorFrom,
	onAnchored,
	jump,
	toolOpen,
	onToggleTool,
}: {
	state: ConversationState;
	onLoadOlder: () => void;
	/** Read the branch tree, so a rail wider than the loaded window can list every turn. */
	onLoadTree: () => Promise<void>;
	/** The row index a sent message will land at or after; scroll it to the top. */
	anchorFrom?: number | undefined;
	onAnchored: () => void;
	/** A search result to bring into view. The nonce makes a repeat of the same row move. */
	jump?: Jump | undefined;
	toolOpen: ReadonlyMap<string, boolean>;
	onToggleTool: (toolCallId: string) => void;
}) {
	const rows = transcript(state);
	const virtual = rows.length > VIRTUALIZE_ABOVE;
	const scroll = useRef<HTMLDivElement>(null);
	const atEnd = useRef(true);
	const anchored = useRef(false);
	const initialized = useRef(false);
	/** The reader reached the top: keep pulling pages until the start or until they move. */
	const [pulling, setPulling] = useState(false);
	const [announcement, setAnnouncement] = useState("");
	/** The user message the rail marks as current, from where the reader is. */
	const [activeUserId, setActiveUserId] = useState<string>();
	/** A tree dot older than the window: load history until the row is here, then scroll. */
	const [pendingJump, setPendingJump] = useState<string>();
	const treeAsked = useRef(false);
	const userRows = rows.flatMap((row) =>
		row.kind === "entry" && row.entry.role === "user" ? [{ id: row.id, text: rowText(row) }] : [],
	);
	const treeUsers = useMemo(() => treeUserRows(state.tree), [state.tree]);
	// The tree is already read when the picker opens; this is the same on-demand read for a
	// window that has fewer than five user turns, so the rail does not disappear in a long
	// assistant reply. A short chat with fewer than five turns still has none.
	useEffect(() => {
		if (treeAsked.current) return;
		if (state.tree.length > 0 || !state.hasOlder || userRows.length >= RAIL_SLOTS) return;
		treeAsked.current = true;
		void onLoadTree().catch(() => {
			treeAsked.current = false;
		});
	}, [onLoadTree, state.hasOlder, state.tree.length, userRows.length]);
	const railRows =
		userRows.length >= RAIL_SLOTS ? userRows : treeUsers.length > 0 ? treeUsers : userRows;

	/** The user row at or above the first row the viewport shows. */
	const syncActive = (): void => {
		const element = scroll.current;
		if (element === null) return;
		const top = element.getBoundingClientRect().top;
		let shown: string | undefined;
		for (const node of element.querySelectorAll<HTMLElement>("[data-row-id]")) {
			if (node.getBoundingClientRect().top - top > END_THRESHOLD) break;
			shown = node.dataset["rowId"];
		}
		const index = shown === undefined ? -1 : rows.findIndex((row) => row.id === shown);
		let user: string | undefined;
		for (let at = index; at >= 0; at -= 1) {
			const row = rows[at];
			if (row?.kind === "entry" && row.entry.role === "user") {
				user = row.id;
				break;
			}
		}
		setActiveUserId(user);
	};

	const jumpToEnd = (): void => {
		if (virtual) virtualizer.scrollToEnd({ behavior: "smooth" });
		else {
			const element = scroll.current;
			element?.scrollTo({ behavior: "smooth", top: element.scrollHeight });
		}
	};

	// The virtualizer is an external store with imperative measurement; memoizing it is
	// neither possible nor wanted, which is exactly what this component should not do.
	// While pages are being pulled the view belongs to the reader, not the end.
	const anchor = pulling ? {} : { anchorTo: "end" as const };
	const virtualizer = useVirtualizer({
		...anchor,
		count: rows.length,
		enabled: virtual,
		estimateSize: (index) => {
			const row = rows[index];
			if (row === undefined) return 88;
			return ESTIMATE[row.kind === "streaming" ? "streaming" : row.entry.role];
		},
		followOnAppend: anchored.current ? false : "auto",
		gap: GAP,
		getItemKey: (index) => rows[index]?.id ?? index,
		getScrollElement: () => scroll.current,
		overscan: 6,
		paddingEnd: PADDING,
		paddingStart: PADDING,
		scrollEndThreshold: END_THRESHOLD,
	});

	// A chat opens on its newest row, and a short chat keeps following new rows while the
	// reader is at the end.
	useLayoutEffect(() => {
		const element = scroll.current;
		if (element === null) return;
		if (virtual) virtualizer.scrollToEnd();
		else element.scrollTop = element.scrollHeight;
		initialized.current = true;
		syncActive();
		// The first mount only: later appends are the virtualizer's or onScroll's business.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const element = scroll.current;
		if (element === null || virtual || anchored.current || !atEnd.current) return;
		element.scrollTop = element.scrollHeight;
	}, [rows.length, virtual]);

	// Holding at the top keeps pulling: one page arrives, the reader has not moved away, so
	// the next page is asked for. A 5,000-entry chat reaches its first message this way.
	useEffect(() => {
		if (!pulling) return;
		if (!state.hasOlder) {
			setPulling(false);
			return;
		}
		onLoadOlder();
	}, [pulling, rows.length, state.hasOlder, onLoadOlder]);

	// A finished reply is announced once; the region never repeats the visible text.
	const wasBusy = useRef(false);
	useEffect(() => {
		if (wasBusy.current && !state.busy) setAnnouncement("Reply finished.");
		wasBusy.current = state.busy;
	}, [state.busy]);

	useEffect(() => {
		if (anchorFrom === undefined) return;
		const index = rows.findIndex(
			(row, at) => at >= anchorFrom && row.kind === "entry" && row.entry.role === "user",
		);
		const row = rows[index];
		if (row === undefined) return;
		anchored.current = true;
		atEnd.current = false;
		if (virtual) virtualizer.scrollToIndex(index, { align: "start" });
		else scroll.current?.querySelector(rowSelector(row.id))?.scrollIntoView({ block: "start" });
		onAnchored();
	}, [anchorFrom, rows, virtual, virtualizer, onAnchored]);

	useEffect(() => {
		if (jump === undefined) return;
		const index = rows.findIndex((row) => row.id === jump.id);
		if (index < 0) return;
		if (virtual) virtualizer.scrollToIndex(index, { align: "center" });
		else scroll.current?.querySelector(rowSelector(jump.id))?.scrollIntoView({ block: "center" });
	}, [jump, rows, virtual, virtualizer]);

	/** Bring a loaded row to the top; false means the row is older than this window. */
	const scrollToRow = useCallback(
		(id: string): boolean => {
			const index = rows.findIndex((row) => row.id === id);
			if (index < 0) return false;
			if (virtual) virtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
			else {
				scroll.current
					?.querySelector(rowSelector(id))
					?.scrollIntoView({ behavior: "smooth", block: "start" });
			}
			return true;
		},
		[rows, virtual, virtualizer],
	);

	const jumpToRow = (id: string): void => {
		if (scrollToRow(id)) {
			setPendingJump(undefined);
			return;
		}
		setPendingJump(id);
	};

	// A rail dot for a turn older than the window walks the history a page at a time, then
	// scrolls once the row arrives. The page loads are the transcript's, not a second read.
	useEffect(() => {
		if (pendingJump === undefined) return;
		if (scrollToRow(pendingJump)) {
			setPendingJump(undefined);
			return;
		}
		if (!state.hasOlder) {
			setPendingJump(undefined);
			return;
		}
		onLoadOlder();
	}, [onLoadOlder, pendingJump, scrollToRow, state.hasOlder]);

	const onScroll = (): void => {
		const element = scroll.current;
		if (element === null) return;
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		atEnd.current = distance < END_THRESHOLD;
		if (atEnd.current) anchored.current = false;
		if (element.scrollTop < 160) setPulling(true);
		syncActive();
	};

	return (
		<>
			<div className="flex min-h-0 flex-1">
				<TranscriptRail
					rows={railRows}
					activeId={activeUserId}
					onJump={jumpToRow}
					onJumpEnd={jumpToEnd}
				/>
				<div
					ref={scroll}
					role="feed"
					aria-busy={state.busy}
					aria-label="Conversation"
					data-slot="chat"
					onScroll={onScroll}
					onWheel={() => setPulling(false)}
					onTouchMove={() => setPulling(false)}
					className="h-full min-w-0 flex-1 overflow-y-auto px-page"
				>
					{virtual ? (
						<div
							className="relative mx-auto w-full max-w-content"
							style={{ height: virtualizer.getTotalSize() }}
						>
							{virtualizer.getVirtualItems().map((item) => {
								const row = rows[item.index];
								if (row === undefined) return null;
								return (
									<article
										key={item.key}
										ref={virtualizer.measureElement}
										data-index={item.index}
										data-row-id={row.id}
										aria-posinset={item.index + 1}
										aria-setsize={rows.length}
										className="absolute inset-x-0 top-0 pb-6"
										style={{ transform: `translateY(${item.start}px)` }}
									>
										<Row row={row} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
									</article>
								);
							})}
						</div>
					) : (
						<div className="mx-auto flex w-full max-w-content flex-col gap-6 py-8">
							{rows.map((row, index) => (
								<article
									key={row.id}
									data-row-id={row.id}
									aria-posinset={index + 1}
									aria-setsize={rows.length}
									className="animate-enter-rise"
								>
									<Row row={row} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
								</article>
							))}
						</div>
					)}
				</div>
			</div>
			{/* The feed is not a live region itself; a finished reply is announced once. */}
			<div aria-live="polite" className="sr-only">
				{announcement}
			</div>
		</>
	);
}

const rowSelector = (id: string): string => `[data-row-id="${CSS.escape(id)}"]`;

type ToolCallBlock = Extract<AssistantBlock, { type: "toolCall" }>;

function Row({
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
	const { entry } = row;
	switch (entry.role) {
		case "user":
			return (
				<Message align="end">
					<MessageContent>
						<Bubble align="end" variant="muted">
							<BubbleContent>
								{entry.images.map((image, index) => (
									// An image in one message has no id of its own; its position in the message is it.
									<img
										key={index}
										alt="attached"
										className="mb-2 max-h-48 rounded-lg"
										src={`data:${image.mimeType};base64,${image.data}`}
									/>
								))}
								<p className="text-body whitespace-pre-wrap">{entry.text}</p>
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);
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
}

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

function AssistantRow({
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
	const running = runs.some((run) => run?.status === "running");
	const count = calls.length;
	const chainTitle =
		count === 0
			? running
				? "Thinking"
				: "Thought"
			: running
				? `Running ${count} ${count === 1 ? "tool" : "tools"}`
				: thinking === ""
					? `Ran ${count} ${count === 1 ? "tool" : "tools"}`
					: `Thought and ran ${count} ${count === 1 ? "tool" : "tools"}`;
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
	// One reasoning block or one call is already a line; a chain only earns its summary
	// when there is more than one step to fold into it.
	const chained = thinking === "" ? count > 1 : count > 0;
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
				{chained ? (
					<ChainOfThought
						title={chainTitle}
						status={running ? "running" : failed > 0 ? "error" : undefined}
						description={failed > 0 ? `${failed} failed` : undefined}
						defaultOpen={failed > 0}
					>
						{stepsContent}
					</ChainOfThought>
				) : (
					stepsContent
				)}
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
}

function StreamingRow({ turn }: { turn: StreamingTurn }) {
	return (
		<Message>
			<MessageContent className="gap-3 text-body">
				{turn.blocks.map((block, index) =>
					block === undefined ? null : block.kind === "thinking" ? (
						// A streaming block is its index in the turn; it has no id of its own.
						<Reasoning key={index} text={block.text} running />
					) : (
						// A text block is its index in the turn too.
						<p key={index} className="whitespace-pre-wrap">
							{block.text}
						</p>
					),
				)}
				<span className="animate-pulse text-muted-foreground motion-reduce:animate-none">▍</span>
			</MessageContent>
		</Message>
	);
}
