import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SidebarMenuItem } from "@/components/ui/sidebar";

/** One page of a sidebar list; Load more adds another. */
const PAGE_SIZE = 10;

/** A page count for one list. Its own component keeps its own depth. */
export function useLoadMore(): [number, () => void] {
	const [limit, setLimit] = useState(PAGE_SIZE);
	return [limit, () => setLimit((current) => current + PAGE_SIZE)];
}

/** The one way a list asks for its next page; the label is also its accessible name. */
export function LoadMore({
	label,
	text,
	onClick,
}: {
	label: string;
	/** What the button says; the label is what a screen reader hears. */
	text: string;
	onClick: () => void;
}) {
	return (
		<SidebarMenuItem>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="w-full justify-center text-muted-foreground"
				aria-label={label}
				onClick={onClick}
			>
				{text}
			</Button>
		</SidebarMenuItem>
	);
}
