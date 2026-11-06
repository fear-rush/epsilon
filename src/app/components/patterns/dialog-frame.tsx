import type { ReactNode } from "react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/** The three dialog sizes: a width and a steady body height each. */
export type DialogSize = "sm" | "md" | "lg";

// The dialog primitive caps its width at `sm:max-w-md`; `!` lets the size win.
const WIDTH: Record<DialogSize, string> = {
	sm: "sm:max-w-dialog-sm",
	md: "sm:max-w-dialog-md",
	lg: "sm:max-w-dialog-lg",
};

// A flex basis, not a height: the body keeps its size between steps, and gives way when the
// window is shorter than the dialog, so the header and footer always stay in view.
const HEIGHT: Record<DialogSize, string> = {
	sm: "basis-dialog-body-sm",
	md: "basis-dialog-body-md",
	lg: "basis-dialog-body-lg",
};

/**
 * A dialog that does not jump between steps: a title and optional description, a body of
 * steady height that scrolls inside and shrinks on a short window, and a footer that stays
 * put. Full width on a phone.
 * `body="content"` is for a dialog with one step, which has nothing to keep steady.
 */
export function DialogFrame({
	open,
	onOpenChange,
	size,
	body = "fixed",
	title,
	description,
	footer,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size: DialogSize;
	/** `content` lets the body size to what it holds; a steady height keeps steps from jumping. */
	body?: "fixed" | "content";
	title: ReactNode;
	description?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("flex w-full flex-col", WIDTH[size])}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description !== undefined && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{/* `px-3 -mx-3` leaves the dialog's gutter: a row's hover chip bleeds 8px into it and its
				    focus ring needs the rest. */}
				<div
					className={cn(
						"-mx-3 min-h-0 shrink overflow-y-auto px-3",
						body === "fixed" && [HEIGHT[size], "grow-0"],
					)}
				>
					{children}
				</div>
				{footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
}
