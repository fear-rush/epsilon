import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ConversationState } from "#domain/conversation/state";
import type { TranscriptEntry } from "#protocol/conversation/frames";

import type { TranscriptRow } from "./transcript-rows";

/** Below this many rows every row is mounted; above it, virtualization starts. */
const VIRTUALIZE_ABOVE = 150;

/** A row's starting height, by what it holds. The virtualizer measures after mounting. */
const ESTIMATE: Record<TranscriptEntry["role"] | "run" | "streaming", number> = {
	assistant: 240,
	run: 48,
	streaming: 120,
	summary: 160,
	toolResult: 44,
	user: 72,
};

/** Smooth scrolling, unless the reader asked for reduced motion. */
export function scrollBehavior(): "auto" | "smooth" {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
const GAP = 24;
const PADDING = 32;
const END_THRESHOLD = 48;

const rowSelector = (id: string): string => `[data-row-id="${CSS.escape(id)}"]`;

/**
 * The scroller's behaviour: the virtualizer, the anchor a sent message scrolls to, loading
 * older pages while the reader holds the top, the end threshold that decides whether a
 * reply is followed, and the rail's current turn.
 */
export function useTranscriptScroll({
	rows,
	state,
	railRows,
	onLoadOlder,
	olderFailure,
	anchorFrom,
	onAnchored,
}: {
	rows: ReadonlyArray<TranscriptRow>;
	state: ConversationState;
	railRows: ReadonlyArray<{ id: string; text: string }>;
	onLoadOlder: () => void;
	olderFailure: string | undefined;
	anchorFrom: number | undefined;
	onAnchored: () => void;
}) {
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
	/** The scroll height before an older page was asked for, so its arrival adds no jump. */
	const prependHeight = useRef<number | undefined>(undefined);

	/** The user row the reader is on, or the newest turn when they are at the end. */
	const syncActive = (): void => {
		const element = scroll.current;
		if (element === null) return;
		// At the end the newest turn is the one being read, even when the row above the fold
		// still belongs to the turn before it.
		if (atEnd.current) {
			setActiveUserId(railRows.at(-1)?.id);
			return;
		}
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
		if (virtual) virtualizer.scrollToEnd({ behavior: scrollBehavior() });
		else {
			const element = scroll.current;
			element?.scrollTo({ behavior: scrollBehavior(), top: element.scrollHeight });
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
			if (row.kind === "run") return ESTIMATE.run;
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
		// oxlint-disable-next-line react-hooks/exhaustive-deps -- runs on first mount only; later appends belong to the virtualizer and onScroll
	}, []);

	useEffect(() => {
		const element = scroll.current;
		if (element === null || virtual || anchored.current || !atEnd.current) return;
		element.scrollTop = element.scrollHeight;
	}, [rows.length, virtual]);

	/**
	 * Ask for the page above this one, remembering the height it will add. The page lands
	 * above the reader, so the layout effect below moves the scroll by that height: the
	 * message they were reading stays where it was instead of being pushed down by fifty
	 * rows arriving over it.
	 */
	const requestOlder = useCallback((): void => {
		const element = scroll.current;
		if (element !== null) prependHeight.current = element.scrollHeight;
		onLoadOlder();
	}, [onLoadOlder]);

	useLayoutEffect(() => {
		const element = scroll.current;
		const before = prependHeight.current;
		if (element === null || before === undefined) return;
		prependHeight.current = undefined;
		const added = element.scrollHeight - before;
		if (added > 0) element.scrollTop += added;
	}, [rows.length]);

	// Holding at the top keeps pulling: one page arrives, the reader has not moved away, so
	// the next page is asked for. A 5,000-entry chat reaches its first message this way. A
	// page that failed stops the loop: the line above offers the retry, and the next scroll
	// to the top tries again.
	useEffect(() => {
		if (!pulling) return;
		if (!state.hasOlder || olderFailure !== undefined) {
			setPulling(false);
			return;
		}
		requestOlder();
	}, [pulling, rows.length, state.hasOlder, olderFailure, requestOlder]);

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

	/** Bring a loaded row to the top; false means the row is older than this window. */
	const scrollToRow = useCallback(
		(id: string): boolean => {
			const index = rows.findIndex((row) => row.id === id);
			if (index < 0) return false;
			if (virtual) virtualizer.scrollToIndex(index, { align: "start", behavior: scrollBehavior() });
			else {
				scroll.current
					?.querySelector(rowSelector(id))
					?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
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
		requestOlder();
	}, [requestOlder, pendingJump, scrollToRow, state.hasOlder]);

	const onScroll = (): void => {
		const element = scroll.current;
		if (element === null) return;
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		atEnd.current = distance < END_THRESHOLD;
		if (atEnd.current) anchored.current = false;
		if (element.scrollTop < 160) setPulling(true);
		syncActive();
	};

	return {
		activeUserId,
		announcement,
		jumpToEnd,
		jumpToRow,
		onScroll,
		requestOlder,
		scroll,
		setPulling,
		virtual,
		virtualizer,
	};
}
