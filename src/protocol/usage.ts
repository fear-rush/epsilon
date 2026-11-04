import { Schema } from "effect";

/**
 * What pi reports about one session's size and cost: three answers from pi's own session
 * object, in one place because the settings context page and a chat's composer show the
 * same numbers and neither of them computes them.
 */

/**
 * How much of the model's window the chat holds. pi answers `null` for the token count
 * and the percentage while the context is unknown (before a model responds, right after
 * a compaction), so a reading with no numbers is still a reading: a surface shows it or
 * hides it, and neither invents a `0%`.
 */
export const ContextUsage = Schema.Struct({
	tokens: Schema.NullOr(Schema.Finite),
	contextWindow: Schema.Finite,
	percent: Schema.NullOr(Schema.Finite),
});
export type ContextUsage = typeof ContextUsage.Type;

/**
 * What the session has cost, summed over every entry pi keeps, including the history a
 * compaction removed: the token counts are totals, not the size of the current context.
 */
export const SessionStats = Schema.Struct({
	tokens: Schema.Struct({
		input: Schema.Finite,
		output: Schema.Finite,
		cacheRead: Schema.Finite,
		cacheWrite: Schema.Finite,
		total: Schema.Finite,
	}),
	cost: Schema.Finite,
	userMessages: Schema.Finite,
	assistantMessages: Schema.Finite,
	toolCalls: Schema.Finite,
	totalMessages: Schema.Finite,
});
export type SessionStats = typeof SessionStats.Type;

/**
 * pi's cache warmer, which fires on its own timer: off, waiting for its next refresh, or
 * refreshing now. `nextWarmAt` is an epoch millisecond, so a page can say when without
 * counting from a moment it never saw. pi's price model (`decision`) and whether an
 * extension overrode it stay out: the footer says when and why, not what it expected to save.
 */
export const CacheWarming = Schema.Struct({
	state: Schema.Literals(["inactive", "scheduled", "refreshing"]),
	/** Why nothing is scheduled, when pi says. */
	reason: Schema.optional(Schema.String),
	nextWarmAt: Schema.optional(Schema.Finite),
});
export type CacheWarming = typeof CacheWarming.Type;
