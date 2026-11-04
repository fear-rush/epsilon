/**
 * pi's cache warmer runs on its own timer, with no session event when it fires. The
 * state pi reports is shown beside the context meter: scheduled, refreshing now, or
 * idle with the reason pi gave. A projected countdown would claim to know more than
 * the last snapshot does, so the time pi named stays in the tooltip.
 */
import type { CacheWarming } from "#protocol/usage";
import { Tip } from "@/components/patterns/tip";

const timeLabel = (at: number): string =>
	new Date(at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

const detailOf = (status: CacheWarming): string => {
	if (status.state === "refreshing") return "pi is refreshing the prompt cache now.";
	if (status.state === "scheduled") {
		return status.nextWarmAt === undefined
			? "pi refreshes the prompt cache on its own timer."
			: `pi refreshes the prompt cache at ${timeLabel(status.nextWarmAt)}.`;
	}
	return status.reason === undefined
		? "pi is not warming the cache."
		: `pi is not warming the cache: ${status.reason}`;
};

const stateLabel = (status: CacheWarming): string => {
	if (status.state === "refreshing") return "warming now";
	if (status.state === "scheduled") return "warming scheduled";
	return "warming idle";
};

export function CacheWarmingState({ status }: { status: CacheWarming | undefined }) {
	if (status === undefined) return null;
	// An inactive warmer with no reason gives a reader nothing to act on.
	if (status.state === "inactive" && status.reason === undefined) return null;
	return (
		<Tip label={detailOf(status)}>
			<span
				tabIndex={0}
				className="rounded-md text-meta text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
			>
				{stateLabel(status)}
			</span>
		</Tip>
	);
}
