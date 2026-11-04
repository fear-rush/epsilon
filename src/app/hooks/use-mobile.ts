import { useSyncExternalStore } from "react";

/**
 * The sidebar column appears at 1280px; below that it is a Sheet, which is what
 * docs/ARCHITECTURE.md (UI rules) asks of the tablet range (768-1279). The registry name stays.
 */
const MOBILE_BREAKPOINT = 1280;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (onChange: () => void): (() => void) => {
	const query = window.matchMedia(QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
};

const matches = (): boolean => window.matchMedia(QUERY).matches;

/** True when the sidebar must render as a Sheet. */
export function useIsMobile(): boolean {
	return useSyncExternalStore(subscribe, matches, () => false);
}
