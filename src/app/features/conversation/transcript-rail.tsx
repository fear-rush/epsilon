import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Tip } from "@/components/patterns/tip";
import { cn } from "@/lib/cn";

import { scrollBehavior } from "./use-transcript-scroll";

/** The rail's five-slot viewport: as many dots as one screenful should hold. */
export const RAIL_SLOTS = 5;

/** One line and a readable length, for a dot's label and tooltip. */
const PREVIEW_LENGTH = 80;

const previewOf = (text: string): string => {
	const line = text.trimStart().split("\n")[0]?.trim() ?? "";
	return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/**
 * The quick jump rail: a five-slot viewport that scrolls through one dot per user message
 * at the transcript's left edge. It owns a gutter beside the scroller rather than sitting
 * over it, so a wide tool result never runs under the dots. The viewport follows the
 * current turn, the chevrons jump to the ends, and it stays faint until used. A chat with
 * fewer than five user turns has none: there is too little to navigate.
 */
export function TranscriptRail({
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
		// The same smooth follow main's rail had: the line moves with the active dot.
		viewport.scrollTo({
			top: Math.max(0, Math.min(target, lastStart)) * slot,
			behavior: scrollBehavior(),
		});
	}, [activeIndex, rows.length]);

	if (rows.length < RAIL_SLOTS) return null;
	const first = rows[0];

	return (
		<div className="hidden w-8 shrink-0 items-center justify-center pl-1 sm:flex">
			<nav
				aria-label="Jump to a message"
				className="flex flex-col items-center opacity-40 transition-[opacity,scale] duration-base focus-within:opacity-100 hover:opacity-100 starting:scale-95 starting:opacity-0"
			>
				<Tip label="First message">
					<button
						type="button"
						aria-label="Go to the first message"
						className="flex size-6 shrink-0 items-center justify-center rounded-chip text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
						onClick={() => {
							if (first !== undefined) onJump(first.id);
						}}
					>
						<ChevronsUpIcon className="size-icon-sm" />
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
										className="group relative flex h-16 w-6 shrink-0 items-center justify-center rounded-chip outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
										onClick={() => onJump(row.id)}
									>
										<span
											className={cn(
												"size-1.5 rounded-pill transition duration-fast group-hover:scale-150 group-focus-visible:scale-150 motion-reduce:transition-none",
												active
													? "opacity-0"
													: "bg-muted-foreground/35 group-hover:bg-muted-foreground/70",
											)}
										/>
									</button>
								</Tip>
							);
						})}
						<span
							aria-hidden
							data-rail-active="true"
							className="pointer-events-none absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-foreground/70 transition-[top] duration-slow ease-in-out"
							style={{ top: `${((activeIndex + 0.5) / rows.length) * 100}%` }}
						/>
					</div>
				</div>
				<Tip label="Last message">
					<button
						type="button"
						aria-label="Go to the last message"
						className="flex size-6 shrink-0 items-center justify-center rounded-chip text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
						onClick={onJumpEnd}
					>
						<ChevronsDownIcon className="size-icon-sm" />
					</button>
				</Tip>
			</nav>
		</div>
	);
}
