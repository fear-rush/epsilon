/** Why pi refuses a move or a copy right now; undefined when it is possible. */
export const branchBlocked = (busy: boolean, isCompacting: boolean): string | undefined =>
	busy ? "Wait for the run to finish" : isCompacting ? "Wait for compaction to finish" : undefined;
