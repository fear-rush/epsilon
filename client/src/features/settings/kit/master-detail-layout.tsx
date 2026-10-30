/**
 * A settings section with a list on the left and the selected entry on the right.
 * The list is a route target as well, so Back and a deep link both work. The
 * section's layout route decides what is selected; this only places the panes,
 * hides the editor pane on a phone until an entry is open, and shows the offline
 * sentence instead when the snapshot cannot be read.
 */
import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "cn";

import { useSettings } from "@/features/settings/queries";

import { OfflineNotice } from "./offline-notice";

export function MasterDetailLayout({ list, editing }: { list: ReactNode; editing: boolean }) {
	const settings = useSettings();
	if (settings.error !== null) return <OfflineNotice message={settings.error.message} />;
	return (
		<div className="flex h-full min-h-0">
			{list}
			<div
				className={cn(
					"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
					!editing && "hidden md:block",
				)}
			>
				<Outlet />
			</div>
		</div>
	);
}

/** What the editor pane says on a wide screen while nothing is selected. */
export function MasterDetailPlaceholder({ children }: { children: ReactNode }) {
	return (
		<div className="hidden h-full items-center justify-center p-8 md:flex">
			<p className="max-w-sm text-center text-sm text-muted-foreground">{children}</p>
		</div>
	);
}
