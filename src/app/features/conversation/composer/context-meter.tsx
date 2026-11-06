/**
 * How full the context window is, from pi's `getContextUsage`. pi leaves the reading
 * unknown before the first response and right after a compaction, so an unknown context
 * is absent rather than a made-up 0%. The hover card carries the exact numbers: the
 * window, the four token counts pi summed, the share served from the provider's cache,
 * and what the session has cost so far.
 */
import { cacheHitRate, costLabel } from "#domain/conversation/format";
import type { ContextUsage, SessionStats } from "#protocol/usage";
import { Context } from "@/components/ai-elements/context";

const grouped = new Intl.NumberFormat(undefined);

/** 24,118 reads as 24K; 1,000,000 as 1M. */
const compactTokens = (tokens: number): string => {
	if (tokens >= 1_000_000) return `${trimZero(tokens / 1_000_000)}M`;
	if (tokens >= 1_000) return `${trimZero(tokens / 1_000)}K`;
	return `${tokens}`;
};

const trimZero = (value: number): string =>
	(value >= 10 ? value.toFixed(0) : value.toFixed(1)).replace(/\.0$/, "");

const percentLabel = (percent: number): string => {
	if (percent > 0 && percent < 0.1) return "<0.1%";
	return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
};

export function ContextMeter({
	usage,
	stats,
}: {
	usage: ContextUsage | undefined;
	stats: SessionStats;
}) {
	// pi answers `null` for both numbers while the context is unknown; that is no reading
	// to show, so the meter stays away instead of claiming an empty window.
	if (usage === undefined) return null;
	const { contextWindow, percent: share, tokens } = usage;
	if (tokens === null || share === null) return null;
	const percent = percentLabel(share);
	const cached = cacheHitRate(stats.tokens);
	return (
		<Context
			label={`${percent} · ${compactTokens(tokens)}`}
			ariaLabel={`Context: ${percent} of ${grouped.format(contextWindow)} tokens used`}
			used={grouped.format(tokens)}
			limit={grouped.format(contextWindow)}
			percent={share}
			rows={[
				{ label: "Input", value: grouped.format(stats.tokens.input) },
				{ label: "Output", value: grouped.format(stats.tokens.output) },
				{ label: "Cache read", value: grouped.format(stats.tokens.cacheRead) },
				{ label: "Cache write", value: grouped.format(stats.tokens.cacheWrite) },
				{
					label: "Cached",
					value: cached === undefined ? "no cache use yet" : percentLabel(cached),
				},
			]}
			footer={`${costLabel(stats.cost)} spent in this session.`}
		/>
	);
}
