/**
 * The bottom-left app card. It opens a menu the way a chat app opens its
 * account menu: a header naming the app, then every settings section, so
 * a phone reaches them without the sidebar. The sections come from the one list
 * the settings shell also reads.
 */
import { useNavigate } from "@tanstack/react-router";
import { Fragment } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { SETTINGS_GROUPS } from "@/features/settings";
import type { SettingsPath } from "@/features/settings";

const AVATAR = "ε";

export function SidebarAccount() {
	const navigate = useNavigate();
	const { isMobile, setOpenMobile } = useSidebar();

	const go = (to: SettingsPath) => {
		if (isMobile) setOpenMobile(false);
		void navigate({ to });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label="App menu"
						className="flex w-full items-center gap-2 rounded-md pad-item text-left hover:bg-sidebar-accent"
					/>
				}
			>
				<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-body font-medium text-primary-foreground">
					{AVATAR}
				</span>
				<span className="grid min-w-0 flex-1 text-left leading-tight">
					<span className="truncate text-body font-medium">epsilon</span>
					<span className="truncate text-meta font-normal text-muted-foreground">Local</span>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="center" sideOffset={8} className="w-64">
				<div className="flex items-center gap-3 pad-item">
					<span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-body font-medium text-primary-foreground">
						{AVATAR}
					</span>
					<div className="min-w-0">
						<p className="truncate text-body font-medium">epsilon</p>
						<p className="truncate text-meta text-muted-foreground">Local</p>
					</div>
				</div>
				{SETTINGS_GROUPS.map((group) => (
					<Fragment key={group.label}>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							{group.items.map(({ to, label, icon: Icon }) => (
								<DropdownMenuItem key={to} onClick={() => go(to)}>
									<Icon />
									{label}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
