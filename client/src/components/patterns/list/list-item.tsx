import { Link } from "@tanstack/react-router";
import type { RegisteredRouter, ValidateLinkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const ITEM =
	"flex w-full min-w-0 flex-col items-stretch rounded-md pad-item text-left transition-colors duration-fast hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

type ListItemProps<TRouter extends RegisteredRouter = RegisteredRouter, TOptions = unknown> = {
	name: ReactNode;
	description?: ReactNode;
	selected?: boolean;
	dimmed?: boolean;
	/** Before the text, such as a provider's logo. */
	icon?: ReactNode;
	/** After the text. */
	trailing?: ReactNode;
	/** Where the row goes, as typed link options: `{ to, params, search }`. */
	link?: ValidateLinkOptions<TRouter, TOptions>;
	onClick?: () => void;
};

/**
 * One row of a list: a name over a quieter description, as a link when it has
 * `link`, as a button when it has `onClick`, and as plain text with neither. `selected` marks the open entry;
 * `dimmed` fades one that is switched off. The link options are one prop so the
 * router checks them against the route (`ValidateLinkOptions`).
 */
export function ListItem<TRouter extends RegisteredRouter, TOptions>(
	props: ListItemProps<TRouter, TOptions>,
): ReactNode;
export function ListItem({
	name,
	description,
	selected = false,
	dimmed = false,
	icon,
	trailing,
	link,
	onClick,
}: ListItemProps): ReactNode {
	const className = cn(ITEM, selected && "bg-muted", dimmed && "opacity-60");
	const content = (
		<span className="flex min-w-0 items-center gap-2">
			{icon}
			<span className="grid min-w-0 flex-1">
				<span className="truncate text-body font-medium">{name}</span>
				{description !== undefined && (
					<span className="truncate text-meta text-muted-foreground">{description}</span>
				)}
			</span>
			{trailing}
		</span>
	);
	if (link === undefined && onClick === undefined) {
		return <div className={cn(className, "hover:bg-transparent")}>{content}</div>;
	}
	if (link === undefined) {
		return (
			<button type="button" className={className} aria-current={selected} onClick={onClick}>
				{content}
			</button>
		);
	}
	return (
		<Link {...link} className={className} aria-current={selected ? "page" : undefined}>
			{content}
		</Link>
	);
}
