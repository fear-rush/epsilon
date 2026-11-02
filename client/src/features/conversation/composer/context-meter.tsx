/**
 * How full the context window is, from pi's `getContextUsage`. pi leaves the
 * reading unknown before the first response and right after a compaction, so an
 * unknown context is absent rather than a made-up 0%. The Tip carries the exact
 * numbers: the window, the four token counts pi summed, the share served from the
 * provider's cache, and what the session has cost so far.
 */
import { cacheHitRate } from "shared";
import type { ContextUsage, SessionStats } from "shared";

import { Tip } from "@/components/patterns/tip";
import { InputGroupText } from "@/components/ui/input-group";
import { costLabel } from "@/features/conversation/cost";

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

/** The token split pi summed over the session's whole history, in one sentence. */
const tokensLabel = (tokens: SessionStats["tokens"]): string => {
	const share = cacheHitRate(tokens);
	const cached = share === undefined ? "no cache use yet" : `${percentLabel(share)} from cache`;
	return `${grouped.format(tokens.input)} input, ${grouped.format(tokens.output)} output, ${grouped.format(tokens.cacheRead)} cache read, ${grouped.format(tokens.cacheWrite)} cache write, ${cached}`;
};

export function ContextMeter({
	usage,
	stats,
}: {
	usage: ContextUsage | undefined;
	stats: SessionStats;
}) {
	if (usage === undefined) return null;
	const percent = percentLabel(usage.percent);
	const detail = `Context window: ${grouped.format(usage.tokens)} of ${grouped.format(usage.contextWindow)} tokens (${percent}). Tokens: ${tokensLabel(stats.tokens)}. ${costLabel(stats.cost)} spent in this session.`;
	return (
		<Tip label={detail}>
			<InputGroupText
				tabIndex={0}
				aria-label={`Context: ${detail}`}
				className="gap-1 rounded-md text-meta tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
			>
				<span>{percent}</span>
				<span className="text-muted-foreground/70">·</span>
				<span>{compactTokens(usage.tokens)}</span>
			</InputGroupText>
		</Tip>
	);
}
