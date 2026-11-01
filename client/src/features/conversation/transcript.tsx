import { Fragment, memo, useEffect, useRef, useState } from "react";
import type { TranscriptRow } from "shared";
import { CatchBoundary } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { cn } from "@/lib/cn";

import { Tip } from "@/components/patterns/tip";
import { Notice } from "@/components/patterns/status/notice";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
	useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { Markdown } from "@/components/editor/markdown";
import { ToolTrace } from "./tool-trace";

/**
 * The transcript: one column, phone-first, no horizontal scrolling. Rows come
 * from `shared/conversation/selectors`, so this file only maps a row kind to a
 * component (docs/ARCHITECTURE.md, UI rules: semantic components, not decorated divs).
 */

export function Transcript({ rows }: { rows: TranscriptRow[] }) {
	return (
		<MessageScrollerProvider autoScroll>
			<MessageScroller>
				<MessageScrollerViewport>
					<MessageScrollerContent className="mx-auto w-full max-w-4xl gap-6 px-3 py-8 sm:px-6">
						{rows.map((row) => (
							<RowItem key={row.key} row={row} />
						))}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<TranscriptRail rows={rows} />
				<MessageScrollerButton />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}

/**
 * The quick jump rail: a five-slot viewport that scrolls through one dot per
 * user message at the transcript's right edge. The line can be scrolled to reach
 * any dot, the viewport follows the current turn, and the chevrons jump to the
 * ends. It stays faint until used. A chat with fewer than five messages has no
 * rail: there is too little to navigate, and five is as many dots as one viewport
 * should hold.
 */
const RAIL_SLOTS = 5;

function TranscriptRail({ rows }: { rows: TranscriptRow[] }) {
	const { scrollToEnd, scrollToMessage } = useMessageScroller();
	const { currentAnchorId } = useMessageScrollerVisibility();
	const [hovered, setHovered] = useState<number | null>(null);
	const railRef = useRef<HTMLDivElement>(null);
	const userRows = rows.filter((row): row is UserRow => row.kind === "user");
	const anchored = userRows.findIndex((row) => row.key === currentAnchorId);
	const activeIndex = anchored === -1 ? userRows.length - 1 : anchored;

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
		const lastStart = Math.max(0, userRows.length - RAIL_SLOTS);
		viewport.scrollTo({
			top: Math.max(0, Math.min(target, lastStart)) * slot,
			behavior: "smooth",
		});
	}, [activeIndex, userRows.length]);

	if (userRows.length < RAIL_SLOTS) return null;
	const first = userRows[0];

	return (
		<div className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-4xl -translate-x-1/2">
			<nav
				aria-label="Jump to a message"
				className="pointer-events-auto absolute top-1/2 right-3 hidden -translate-y-1/2 flex-col items-center opacity-40 transition-all duration-base starting:scale-95 starting:opacity-0 hover:opacity-100 focus-within:opacity-100 sm:flex xl:right-0"
			>
				<Tip label="First message">
					<button
						type="button"
						aria-label="Go to the first message"
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
						onClick={() => {
							if (first !== undefined) {
								scrollToMessage(first.key, { align: "start", behavior: "smooth" });
							}
						}}
					>
						<ChevronsUpIcon className="size-3.5" />
					</button>
				</Tip>
				<div
					ref={railRef}
					className="relative h-80 w-6 overflow-y-auto overscroll-contain scrollbar-none"
				>
					<div className="relative flex flex-col items-center">
						<span
							aria-hidden
							className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
						/>
						{userRows.map((row, index) => {
							const preview = previewOf(row.text) || `Message ${index + 1}`;
							const active = index === activeIndex;
							return (
								<Tip key={row.key} label={`${index + 1}. ${preview}`}>
									<button
										type="button"
										aria-label={`Go to message ${index + 1}: ${preview}`}
										aria-current={active ? "step" : undefined}
										className="relative flex h-16 w-6 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
										onPointerEnter={() => setHovered(index)}
										onPointerLeave={() => setHovered(null)}
										onFocus={() => setHovered(index)}
										onBlur={() => setHovered(null)}
										onClick={() => scrollToMessage(row.key, { align: "start", behavior: "smooth" })}
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
							style={{ top: `${((activeIndex + 0.5) / userRows.length) * 100}%` }}
						/>
					</div>
				</div>
				<Tip label="Last message">
					<button
						type="button"
						aria-label="Go to the last message"
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
						onClick={() => scrollToEnd({ behavior: "smooth" })}
					>
						<ChevronsDownIcon className="size-3.5" />
					</button>
				</Tip>
			</nav>
		</div>
	);
}

type UserRow = Extract<TranscriptRow, { kind: "user" }>;

/** One line and a readable length, for a dot's label and tooltip. */
const PREVIEW_LENGTH = 80;
const previewOf = (text: string): string => {
	const line = text.trimStart().split("\n")[0]?.trim() ?? "";
	return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/**
 * A row that did not change keeps its element: the selectors return the same row
 * object for an unchanged message, so a streaming reply re-renders only itself.
 * One unrenderable message stays one notice instead of taking the page down.
 */
const RowItem = memo(function RowItem({ row }: { row: TranscriptRow }) {
	return (
		<MessageScrollerItem
			messageId={row.key}
			scrollAnchor={row.kind === "user"}
			className="animate-enter-rise"
		>
			<CatchBoundary getResetKey={() => row.key} errorComponent={RowError}>
				<Row row={row} />
			</CatchBoundary>
		</MessageScrollerItem>
	);
});

function RowError({ error }: ErrorComponentProps) {
	return (
		<Notice tone="error">
			This message could not be shown. {error instanceof Error ? error.message : String(error)}
		</Notice>
	);
}

function Row({ row }: { row: TranscriptRow }) {
	switch (row.kind) {
		case "user":
			return (
				<Message align="end">
					<MessageContent>
						<Bubble variant="muted" align="end">
							<BubbleContent>
								<Fragment>
									{row.images.map((image, index) => (
										<img
											key={index}
											alt="attached"
											className="mb-2 max-h-48 rounded-lg"
											src={`data:${image.mimeType};base64,${image.data}`}
										/>
									))}
									<span className="whitespace-pre-wrap">{row.text}</span>
								</Fragment>
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);
		case "assistant":
			return (
				<Message align="start">
					<MessageContent>
						{row.thinking !== "" && (
							<p className="mb-2 text-meta whitespace-pre-wrap text-muted-foreground">
								{row.thinking}
							</p>
						)}
						{row.text !== "" && <Markdown>{row.text}</Markdown>}
						{row.streaming && (
							<span className="animate-pulse text-muted-foreground motion-reduce:animate-none">
								▍
							</span>
						)}
					</MessageContent>
				</Message>
			);
		case "tool":
			return <ToolTrace run={row.run} />;
		case "summary":
			return (
				<Fragment>
					<Marker variant="separator">{row.label}</Marker>
					<p className="max-h-64 overflow-auto px-1 text-meta whitespace-pre-wrap text-muted-foreground">
						{row.text}
					</p>
				</Fragment>
			);
		case "notice":
			if (row.notice.kind === "error") {
				return (
					<Notice tone="error">
						<span className="block max-h-48 overflow-auto whitespace-pre-wrap">
							{row.notice.text}
						</span>
					</Notice>
				);
			}
			return (
				<Marker variant="separator" data-kind={row.notice.kind}>
					{row.notice.text}
				</Marker>
			);
	}
}
