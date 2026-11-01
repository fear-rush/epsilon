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
	/** `content` lets the body size to what it holds; a fixed height keeps steps steady. */
	body?: "fixed" | "content";
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
				{/* `px-3 -mx-3` leaves the dialog's gutter: a row's hover chip bleeds 8px into it and its
				    focus ring needs the rest. */}
				<div className={cn("-mx-3 min-h-0 overflow-y-auto px-3", body === "fixed" && HEIGHT[size])}>
					{children}
				</div>
				{footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
}
