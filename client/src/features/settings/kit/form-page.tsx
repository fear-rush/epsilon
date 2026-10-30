/**
 * The frame of a detail editor: a scrolling body under a title, and a footer with
 * the status text and the actions. Every editor in a master/detail section uses
 * it, so Save, Cancel and Delete sit in the same place everywhere.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** The list route of each master/detail section, which the mobile back link returns to. */
export type MasterPath = "/settings/providers" | "/settings/mcp" | "/settings/skills";

export function FormPage({
	backTo,
	backLabel,
	title,
	badge,
	description,
	children,
	footer,
}: {
	backTo: MasterPath;
	backLabel: string;
	title: string;
	badge?: ReactNode;
	description?: string;
	children: ReactNode;
	footer: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8 sm:px-8">
					<header className="grid gap-2">
						<Link
							to={backTo}
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"-ml-2 self-start md:hidden",
							)}
						>
							<ArrowLeftIcon />
							{backLabel}
						</Link>
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
							{badge}
						</div>
						{description !== undefined && (
							<p className="text-sm text-muted-foreground">{description}</p>
						)}
					</header>
					{children}
				</div>
			</div>
			{footer}
		</div>
	);
}

export function FormFooter({
	dirty,
	isNew,
	saving,
	onSave,
	onCancel,
	onDelete,
	extra,
}: {
	dirty: boolean;
	isNew: boolean;
	saving: boolean;
	onSave: () => void;
	onCancel: () => void;
	onDelete: () => void;
	/** Actions that sit before Cancel / Delete, such as a connection test. */
	extra?: ReactNode;
}) {
	return (
		<footer className="shrink-0 border-t">
			<div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
				<span className="text-xs text-muted-foreground">
					{dirty ? "Unsaved changes" : isNew ? "Not saved yet" : ""}
				</span>
				<div className="flex items-center gap-2">
					{extra}
					<Button type="button" variant="destructive" onClick={isNew ? onCancel : onDelete}>
						{isNew ? "Cancel" : "Delete"}
					</Button>
					<Button type="button" onClick={onSave} disabled={saving}>
						{saving && <Spinner data-icon="inline-start" />}
						Save
					</Button>
				</div>
			</div>
		</footer>
	);
}
