/** Why pi refuses a move or a copy right now; undefined when it is possible. */
export const branchBlocked = (busy: boolean, isCompacting: boolean): string | undefined =>
	busy
		? "Wait for the run to finish: pi refuses to move or copy this chat while it streams"
		: isCompacting
			? "Wait for the compaction to finish: pi refuses to move or copy this chat while it compacts"
			: undefined;
