import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

/** The three dialog sizes: a width and a fixed body height each. */
export type DialogSize = "sm" | "md" | "lg";

// The dialog primitive caps its width at `sm:max-w-md`; `!` lets the size win.
const WIDTH: Record<DialogSize, string> = {
	sm: "sm:max-w-dialog-sm",
	md: "sm:max-w-dialog-md",
	lg: "sm:max-w-dialog-lg",
};

const HEIGHT: Record<DialogSize, string> = {
	sm: "h-dialog-body-sm",
	md: "h-dialog-body-md",
	lg: "h-dialog-body-lg",
};

/**
 * A dialog that never resizes: a title and optional description, a body of fixed
 * height that scrolls inside, and a footer that stays put. Full width on a phone.
 */
export function DialogFrame({
	open,
	onOpenChange,
	size,
	title,
	description,
	footer,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size: DialogSize;
	title: ReactNode;
	description?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("w-full", WIDTH[size])}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description !== undefined && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div className={cn("min-h-0 overflow-y-auto", HEIGHT[size])}>{children}</div>
				{footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
}
