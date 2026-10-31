import { LoadingState } from "@/components/patterns/status/loading-state";

/** What a route shows while its loader warms the page. */
export function RoutePending() {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-6">
			<LoadingState label="Loading…" />
		</div>
	);
}
