import { Outlet } from "@tanstack/react-router";

import { LoadingState } from "@/components/patterns/status/loading-state";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SessionSidebar } from "@/features/sessions";
import { useReadiness } from "@/status";

import { NotReady } from "./not-ready";

/**
 * The session surface: the sidebar, and the page beside it behind the readiness gate.
 *
 * Settings is its own full-page surface and never mounts this shell, so a page that
 * cannot run a turn never starts an engine.
 */
export function AppShell() {
	const readiness = useReadiness();
	const unsupported = readiness.data?.ready === false ? readiness.data : undefined;

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
