/**
 * How a number reads in a sentence, in pi's own short forms. Approximate by design,
 * which is all a tooltip or a notice needs.
 */

/** pi's footer form for a token count: 950, 1.2k, 12k, 1.3M. */
export const tokenLabel = (count: number): string => {
	if (count < 1_000) return count.toString();
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
};

/** What a bill reads as; four decimals while it is almost nothing. */
export const costLabel = (cost: number): string => {
	if (cost === 0) return "$0";
	return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
};

/**
 * Share of the prompt served from the provider's cache, or undefined when no prompt
 * token has been counted yet. Cache reads and writes are part of the prompt, so both sit
 * in the denominator; output tokens are not.
 */
export const cacheHitRate = (tokens: {
	input: number;
	cacheRead: number;
	cacheWrite: number;
}): number | undefined => {
	const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite;
	return prompt === 0 ? undefined : (tokens.cacheRead / prompt) * 100;
};
