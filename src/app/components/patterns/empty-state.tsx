import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one empty state: an optional icon, "No {plural} yet" (VO-7) and an optional action.
 * See DESIGN.md → empty-state.
 */
export function EmptyState({
	icon: Icon,
	title,
	action,
}: {
	icon?: LucideIcon;
	title: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 text-meta text-muted-foreground">
			{Icon !== undefined && <Icon className="size-icon shrink-0" aria-hidden />}
			<span className="min-w-0 truncate">{title}</span>
			{action}
		</div>
	);
}
