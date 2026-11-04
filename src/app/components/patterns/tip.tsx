import type { ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A shadcn tooltip around one control, for buttons that show only an icon. The
 * control keeps its own `aria-label`; the tooltip is for the pointer and keyboard
 * focus. `keys` is a shortcut that exists, never a wish.
 */
export function Tip({
	label,
	keys,
	children,
}: {
	label: string;
	keys?: string;
	children: ReactElement;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>
				{label}
				{keys !== undefined && <span className="opacity-70">{keys}</span>}
			</TooltipContent>
		</Tooltip>
	);
}
