/**
 * The one destructive confirmation every list uses. A page keeps its own mutation
 * and passes its pending state; only the dialog, the spinner and the error line
 * are shared, so a new list cannot invent a different confirmation.
 */
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

export function DeleteDialog({
	open,
	title,
	description,
	error,
	pending = false,
	confirmLabel = "Remove",
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	title: ReactNode;
	description: ReactNode;
	error: Error | null;
	pending?: boolean;
	confirmLabel?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{error !== null && (
					<Alert variant="destructive">
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
						{pending && <Spinner data-icon="inline-start" />}
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
