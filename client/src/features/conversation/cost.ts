/**
 * What a session has cost, spelled the same wherever it appears: the context meter's
 * tip and `/session`'s own sentence.
 */

/** Cents for a real bill, four decimals while a session has cost almost nothing. */
export const costLabel = (cost: number): string => {
	if (cost === 0) return "$0";
	return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
};
