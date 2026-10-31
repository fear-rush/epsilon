import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A list column on the left and the selected entry on the right. The list is a
 * route target as well, so Back and a deep link both work. On a phone the detail
 * pane is hidden until an entry is open (`editing`), and the list gives way to it.
 */
export function MasterDetail({ list, editing }: { list: ReactNode; editing: boolean }) {
	return (
		<div className="flex h-full min-h-0">
			<div
				className={cn(
					"w-full shrink-0 flex-col md:flex md:w-list",
					editing ? "hidden md:flex" : "flex",
				)}
			>
				{list}
			</div>
			<div
				className={cn(
					"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
					!editing && "hidden md:flex",
				)}
			>
				<Outlet />
			</div>
		</div>
	);
}
