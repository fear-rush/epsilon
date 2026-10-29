/**
 * The settings page furniture: a page header, a grouped card and one row inside
 * it. Rows carry a title, a muted description and actions on the right, which is
 * the shape the panel's sections share (docs/ui.md, "Settings page").
 */
import type { ReactNode } from "react";
import { cn } from "cn";

export function SettingsPage({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-8 sm:px-8">
			<header className="grid gap-1">
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				{description !== undefined && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</header>
			{children}
		</div>
	);
}

export function SettingsGroup({
	title,
	description,
	children,
}: {
	title?: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-2">
			{title !== undefined && <h2 className="text-sm font-medium">{title}</h2>}
			{description !== undefined && <p className="text-xs text-muted-foreground">{description}</p>}
			<div className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</div>
		</section>
	);
}

export function SettingsRow({
	title,
	description,
	stacked = false,
	children,
}: {
	title: string;
	description?: string;
	/** Puts the control on its own line, full width, for one that needs the room. */
	stacked?: boolean;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 px-4 py-3",
				stacked
					? "items-stretch"
					: "items-start justify-between sm:flex-row sm:items-center sm:gap-4",
			)}
		>
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{title}</p>
				{description !== undefined && (
					<p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			{children !== undefined && (
				<div
					className={cn(
						"flex items-center gap-2",
						stacked ? "w-full" : "w-full flex-wrap sm:w-auto sm:shrink-0 sm:justify-end",
					)}
				>
					{children}
				</div>
			)}
		</div>
	);
}

/** A row that holds a form or a block instead of a title line. */
export function SettingsBlock({ children }: { children: ReactNode }) {
	return <div className="p-4">{children}</div>;
}
