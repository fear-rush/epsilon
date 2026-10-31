/**
 * How full the context window is, from pi's `getContextUsage`. pi leaves the
 * reading unknown before the first response and right after a compaction, so an
 * unknown context is absent rather than a made-up 0%. The Tip carries the exact
 * numbers and what the session has cost so far.
 */
import type { ContextUsage } from "shared";

import { Tip } from "@/components/patterns/tip";
import { InputGroupText } from "@/components/ui/input-group";

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

/** Cents for a real bill, four decimals while a session has cost almost nothing. */
const costLabel = (cost: number): string => {
	if (cost === 0) return "$0";
	return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
};

export function ContextMeter({ usage, cost }: { usage: ContextUsage | undefined; cost: number }) {
	if (usage === undefined) return null;
	const percent = percentLabel(usage.percent);
	const detail = `Context window: ${grouped.format(usage.tokens)} of ${grouped.format(usage.contextWindow)} tokens (${percent}). ${costLabel(cost)} spent in this session.`;
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
