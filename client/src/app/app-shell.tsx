/**
 * The session surface: the sidebar, and the page beside it behind the readiness
 * gate. Settings is its own full-page surface and never mounts this shell.
 */
import { Outlet } from "@tanstack/react-router";

import { LoadingState } from "@/components/patterns/status/loading-state";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { NotReady } from "@/features/readiness/not-ready";
import { useReadiness } from "@/features/readiness/use-readiness";
import { SessionSidebar } from "@/features/sessions/session-sidebar";

export function AppShell() {
	// An Epsilon with no usable model replaces every other page with one
	// notice. The check is REST, so it is read once here instead of once per
	// route; Settings stays reachable so the notice has somewhere to send you.
	const readiness = useReadiness();
	const unsupported = readiness.data?.ready === false ? readiness.data : undefined;
	// Do not mount a session route (and therefore an engine) until the answer is
	// in. An unconfigured home must show its notice first, not build an engine.
	return (
		<SidebarProvider className="h-full min-h-0">
			<SessionSidebar />
			<SidebarInset className="min-h-0 animate-enter-fade overflow-hidden">
				{readiness.isPending ? (
					<div className="flex flex-1 items-center justify-center">
						<LoadingState label="Starting…" />
					</div>
				) : unsupported === undefined ? (
					<Outlet />
				) : (
					<NotReady state={unsupported} />
				)}
			</SidebarInset>
		</SidebarProvider>
	);
}
