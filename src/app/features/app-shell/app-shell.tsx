import { Outlet } from "@tanstack/react-router";

import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { SessionSidebar } from "@/features/sessions";
import { useReadiness } from "@/status";

import { NotReady } from "./not-ready";

/**
 * The app surface: the chat column, and the page beside it.
 *
 * An Epsilon that cannot run a turn replaces the page with one notice; Settings is its own
 * surface and stays reachable, which is where the notice sends the reader. The page is kept
 * unmounted until readiness answers, so no chat starts an engine on an unconfigured home.
 */
export function AppShell() {
	const readiness = useReadiness();

	return (
		<div className="flex min-h-0 flex-1">
			<SessionSidebar />
			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<Gate readiness={readiness} />
			</main>
		</div>
	);
}

function Gate({ readiness }: { readiness: ReturnType<typeof useReadiness> }) {
	if (readiness.isPending) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<LoadingState label="Starting…" />
			</div>
		);
	}
	if (readiness.error !== null) return <ReadinessError error={readiness.error} />;
	if (readiness.data.ready) return <Outlet />;
	return <NotReady state={readiness.data} />;
}

function ReadinessError({ error }: { error: Error }) {
	const view = errorView(error);
	return <StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />;
}
