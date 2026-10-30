/**
 * Removal for a list whose rows grow and collapse instead of popping out. The
 * transition is in `index.css` under `settings-row-anim`; this owns its timing.
 *
 * The collapse outlives one render, so the row is dropped from the latest list:
 * the click the row received may be older than an edit made while it closed.
 */
import { useEffect, useRef, useState } from "react";

/** The collapse the CSS animates; the row is dropped once it finished. */
const COLLAPSE_MS = 220;

export type AnimatedRows = {
	/** The row collapsing right now; every other row is stable. */
	closing: number | undefined;
	remove: (index: number) => void;
};

export function useAnimatedRows<T>(
	rows: readonly T[],
	onChange: (rows: T[]) => void,
): AnimatedRows {
	const [closing, setClosing] = useState<number | undefined>();
	const latest = useRef({ rows, onChange });
	useEffect(() => {
		latest.current = { rows, onChange };
	}, [rows, onChange]);
	const remove = (index: number) => {
		setClosing(index);
		window.setTimeout(() => {
			const { rows: current, onChange: apply } = latest.current;
			apply(current.filter((_, at) => at !== index));
			setClosing(undefined);
		}, COLLAPSE_MS);
	};
	return { closing, remove };
}
