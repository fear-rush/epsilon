import { Link, useMatchRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Input } from "@/components/ui/input";
import { SIDEBAR_WIDTH } from "@/components/ui/sidebar";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "@/features/settings/sections";
import type { SettingsSection } from "@/features/settings/sections";

/**
 * The settings surface: its own left navigation, a search field, and one section
 * on the right. It replaces the session sidebar while it is open, so Back to app
 * is the way out.
 */

const itemsFor = (query: string): SettingsSection[] => {
	if (query.trim() === "") return [];
	const needle = query.trim().toLowerCase();
	return SETTINGS_SECTIONS.filter((item) => item.label.toLowerCase().includes(needle));
};

function NavLink({ section, active }: { section: SettingsSection; active: boolean }) {
	const Icon = section.icon;
	return (
		<Link
			to={section.to}
			className={cn(
				"flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
				active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
			)}
		>
			<Icon className="size-4" />
			{section.label}
		</Link>
	);
}

export function SettingsShell({ children }: { children: ReactNode }) {
	const matchRoute = useMatchRoute();
	const [query, setQuery] = useState("");
	const results = itemsFor(query);
	const filtering = query.trim() !== "";
	const active = (section: SettingsSection) =>
		matchRoute({ to: section.to, fuzzy: true }) !== false;

	return (
		<div className="flex h-svh min-h-0 flex-col bg-background">
			<header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
				<Link to="/" aria-label="Back to app" className="p-1 text-muted-foreground">
					<ArrowLeftIcon className="size-4" />
				</Link>
				<span className="text-sm font-medium">Settings</span>
			</header>

			<div className="flex min-h-0 flex-1">
				<aside
					style={{ width: SIDEBAR_WIDTH }}
					className="hidden shrink-0 flex-col gap-4 border-r p-3 md:flex"
				>
					<Link
						to="/"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
					>
						<ArrowLeftIcon className="size-4" />
						Back to app
					</Link>
					<div className="relative">
						<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							placeholder="Search"
							aria-label="Search settings"
							className="pl-8"
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<nav className="grid gap-4 overflow-y-auto">
						{filtering ? (
							<div className="grid gap-0.5">
								{results.length === 0 ? (
									<p className="px-2 text-xs text-muted-foreground">No matching section.</p>
								) : (
									results.map((section) => (
										<NavLink key={section.to} section={section} active={active(section)} />
									))
								)}
							</div>
						) : (
							SETTINGS_GROUPS.map((group) => (
								<div key={group.label} className="grid gap-0.5">
									<p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
										{group.label}
									</p>
									{group.items.map((section) => (
										<NavLink key={section.to} section={section} active={active(section)} />
									))}
								</div>
							))
						)}
					</nav>
				</aside>

				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<nav className="flex gap-1 overflow-x-auto border-b p-2 md:hidden">
						{SETTINGS_SECTIONS.map((section) => (
							<NavLink key={section.to} section={section} active={active(section)} />
						))}
					</nav>
					<main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
				</div>
			</div>
		</div>
	);
}
