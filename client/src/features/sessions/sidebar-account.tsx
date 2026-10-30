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
import { SETTINGS_GROUPS } from "@/features/settings/sections";
import type { SettingsPath } from "@/features/settings/sections";

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
						className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-sidebar-accent"
					/>
				}
			>
				<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
					{AVATAR}
				</span>
				<span className="grid min-w-0 flex-1 text-left leading-tight">
					<span className="truncate text-sm font-medium">epsilon</span>
					<span className="truncate text-xs font-normal text-muted-foreground">Epsilon</span>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="center" sideOffset={8} className="w-64">
				<div className="flex items-center gap-3 px-2 py-2">
					<span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
						{AVATAR}
					</span>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">epsilon</p>
						<p className="truncate text-xs text-muted-foreground">Local</p>
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
