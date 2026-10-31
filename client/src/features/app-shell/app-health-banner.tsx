import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AppBanner } from "@/components/patterns/status/app-banner";
import { useAppHealth } from "./use-app-health";

/** The strip at the top of the app, for connection and version problems only. */
export function AppHealthBanner() {
	const health = useAppHealth();
	if (health === "ok") return null;
	if (health === "stale") {
		return (
			<AppBanner
				tone="destructive"
				action={
					<Button size="xs" variant="outline" onClick={() => window.location.reload()}>
						Reload
					</Button>
				}
			>
				Epsilon was updated. Reload to continue.
			</AppBanner>
		);
	}
	return (
		<AppBanner tone="warning">
			<span className="inline-flex items-center gap-2">
				<Spinner />
				Reconnecting to the server…
			</span>
		</AppBanner>
	);
}
