/**
 * The chat page's top bar: the same `h-bar` as the sidebar's, so the rules line up.
 * It carries the sidebar toggle while the sidebar is off-screen.
 */
import type { ReactNode } from "react";

import { Tip } from "@/components/patterns/tip";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

function BarSidebarTrigger() {
	const { open, isMobile } = useSidebar();
	if (open && !isMobile) return null;
	return (
		<Tip label="Show sidebar">
			<SidebarTrigger />
		</Tip>
	);
}

export function ChatBar({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
	return (
		<PaneBar
			gutter="pane"
			className="animate-enter-fade"
			leading={<BarSidebarTrigger />}
			title={title}
			actions={actions}
		/>
	);
}
