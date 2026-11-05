import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { assistantText, assistantThinking, entryLabel } from "#domain/conversation/content";
import { toolRunOf, transcript } from "#domain/conversation/selectors";
import type { ConversationState, StreamingTurn } from "#domain/conversation/state";
import type { AssistantEntry, TranscriptEntry } from "#protocol/conversation/frames";
import { Markdown } from "@/components/editor/markdown";
import { toneText } from "@/components/patterns/status/status-tone";
import { Tip } from "@/components/patterns/tip";
import { cn } from "@/lib/cn";

import { ToolTrace } from "./tool-trace";

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

/**
 * The quick jump rail: a five-slot viewport that scrolls through one dot per user message
 * at the transcript's right edge. The viewport follows the current turn, the chevrons jump
 * to the ends, and it stays faint until used. A chat with fewer than five messages has
 * none: there is too little to navigate.
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
	const [hovered, setHovered] = useState<number | null>(null);
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
		viewport.scrollTo({
			top: Math.max(0, Math.min(target, lastStart)) * slot,
			behavior: "smooth",
		});
	}, [activeIndex, rows.length]);

	if (rows.length < RAIL_SLOTS) return null;
	const first = rows[0];

	return (
		<div className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-content -translate-x-1/2">
			<nav
				aria-label="Jump to a message"
				className="pointer-events-auto absolute top-1/2 right-3 hidden -translate-y-1/2 flex-col items-center opacity-40 transition-all duration-base focus-within:opacity-100 hover:opacity-100 sm:flex xl:right-0 starting:scale-95 starting:opacity-0"
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
										onPointerEnter={() => setHovered(index)}
										onPointerLeave={() => setHovered(null)}
										onFocus={() => setHovered(index)}
										onBlur={() => setHovered(null)}
										onClick={() => onJump(row.id)}
									>
										<span
											className={cn(
												"size-1.5 rounded-full transition duration-fast",
												active ? "opacity-0" : "bg-muted-foreground/35",
												hovered === index && "scale-150 bg-foreground/70",
											)}
										/>
									</button>
								</Tip>
							);
						})}
						<span
							aria-hidden
							className={cn(
								"pointer-events-none absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70 transition-all duration-slow ease-in-out",
								hovered === activeIndex && "scale-150",
							)}
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
	anchorFrom,
	onAnchored,
	jump,
	toolOpen,
	onToggleTool,
}: {
	state: ConversationState;
	onLoadOlder: () => void;
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
	const userRows = rows.flatMap((row) =>
		row.kind === "entry" && row.entry.role === "user" ? [{ id: row.id, text: rowText(row) }] : [],
	);

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

	/** Bring one row to the top of the view, the rail's jump. */
	const jumpToRow = (id: string): void => {
		const index = rows.findIndex((row) => row.id === id);
		if (index < 0) return;
		if (virtual) virtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
		else {
			scroll.current
				?.querySelector(rowSelector(id))
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
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
			<div className="relative min-h-0 flex-1">
				<div
					ref={scroll}
					role="feed"
					aria-busy={state.busy}
					aria-label="Conversation"
					onScroll={onScroll}
					onWheel={() => setPulling(false)}
					onTouchMove={() => setPulling(false)}
					className="h-full overflow-y-auto px-page"
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
				<TranscriptRail
					rows={userRows}
					activeId={activeUserId}
					onJump={jumpToRow}
					onJumpEnd={jumpToEnd}
				/>
			</div>
			{/* The feed is not a live region itself; a finished reply is announced once. */}
			<div aria-live="polite" className="sr-only">
				{announcement}
			</div>
		</>
	);
}

const rowSelector = (id: string): string => `[data-row-id="${CSS.escape(id)}"]`;

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
				<div className="ml-auto w-fit max-w-xl rounded-xl bg-muted px-3 py-2">
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
				</div>
			);
		case "assistant":
			return (
				<AssistantRow entry={entry} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
			);
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
	// A message that only called tools still has a row: its calls are what it said.
	const silent = text === "" && thinking === "" && !entry.blocks.some((b) => b.type === "toolCall");
	return (
		<div className={cn("grid gap-2", silent && "hidden")}>
			{thinking === "" ? null : state.hideThinking ? (
				// pi draws a label where it hid thinking instead of dropping the block, so a
				// reply that only thought still has a row to stand on.
				<p className="mb-2 text-meta whitespace-pre-wrap text-muted-foreground">
					{state.hiddenThinkingLabel ?? DEFAULT_HIDDEN_THINKING_LABEL}
				</p>
			) : (
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
					<ToolTrace
						key={block.toolCallId}
						args={block.args}
						name={block.toolName}
						open={toolOpen.get(block.toolCallId) ?? false}
						run={toolRunOf(state, block.toolCallId)}
						onToggle={() => onToggleTool(block.toolCallId)}
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
					<p key={index} className="text-meta whitespace-pre-wrap text-muted-foreground">
						{block.text}
					</p>
				) : (
					// A text block is its index in the turn too.
					<p key={index} className="whitespace-pre-wrap">
						{block.text}
					</p>
				),
			)}
			<span className="animate-pulse text-muted-foreground motion-reduce:animate-none">▍</span>
		</div>
	);
}

function ToolOutput({ output, isError }: { output: string; isError: boolean }) {
	if (output === "") return null;
	return (
		<pre
			className={toneText(
				isError ? "danger" : "neutral",
				"overflow-auto rounded-lg border bg-card px-3 py-2 text-code break-words whitespace-pre-wrap",
			)}
		>
			{output}
		</pre>
	);
}
