import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { Input } from "@/components/ui/input";
import { PaneBand } from "@/components/patterns/pane/pane-band";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "@/features/settings/shell/sections";
import type { SettingsSection } from "@/features/settings/shell/sections";

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

/** The router reports which section is open; this file does not subscribe to the match itself. */
function NavLink({ section }: { section: SettingsSection }) {
	const Icon = section.icon;
	return (
		<Link to={section.to} className="block" activeProps={{ "aria-current": "page" }}>
			{({ isActive }) => (
				<span
					className={cn(
						"flex items-center gap-2 rounded-md pad-item text-body transition-colors duration-fast",
						isActive
							? "bg-muted font-medium text-foreground"
							: "text-muted-foreground hover:bg-muted/60",
					)}
				>
					<Icon className="size-4" />
					{section.label}
				</span>
			)}
		</Link>
	);
}

/** Fills the surface under the root's health banner, which owns connection problems. */
export function SettingsShell({ children }: { children: ReactNode }) {
	const [query, setQuery] = useState("");
	const results = itemsFor(query);
	const filtering = query.trim() !== "";

	return (
		<div className="flex h-full min-h-0 animate-enter-fade flex-col bg-background">
			<header className="md:hidden">
				<PaneBar
					leading={
						<Link to="/" aria-label="Back to app" className="text-muted-foreground">
							<ArrowLeftIcon className="size-4" />
						</Link>
					}
					title="Settings"
				/>
			</header>

			<div className="flex min-h-0 flex-1">
				<aside className="hidden w-nav shrink-0 animate-enter-left flex-col border-r md:flex">
					<PaneBar
						leading={
							<Link
								to="/"
								className="flex items-center gap-2 text-body text-muted-foreground transition-colors duration-fast hover:text-foreground"
							>
								<ArrowLeftIcon className="size-4" />
								Back to app
							</Link>
						}
					/>
					<PaneBand>
						<div className="relative w-full">
							<SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								placeholder="Search"
								aria-label="Search settings"
								className="pl-8"
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
					</PaneBand>
					<nav className="grid gap-section overflow-y-auto p-pane">
						{filtering ? (
							<div className="grid gap-row">
								{results.length === 0 ? (
									<p className="px-2 text-meta text-muted-foreground">No matching section.</p>
								) : (
									results.map((section) => <NavLink key={section.to} section={section} />)
								)}
							</div>
						) : (
							SETTINGS_GROUPS.map((group, index) => (
								<div
									key={group.label}
									className={cn(
										"grid animate-enter-rise gap-0.5",
										index === 0 ? "enter-delay-1" : "enter-delay-2",
									)}
								>
									<p className="px-2 pb-1 text-meta font-medium text-muted-foreground">
										{group.label}
									</p>
									{group.items.map((section) => (
										<NavLink key={section.to} section={section} />
									))}
								</div>
							))
						)}
					</nav>
				</aside>

				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<nav className="flex gap-1 overflow-x-auto p-2 md:hidden">
						{SETTINGS_SECTIONS.map((section) => (
							<NavLink key={section.to} section={section} />
						))}
					</nav>
					<main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
				</div>
			</div>
		</div>
	);
}
