/**
 * A new entry is a route with a draft, so leaving it needs its own exit. The
 * confirmation is destructive because confirming throws the whole draft away.
 */
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

export function CancelDialog({
	open,
	title,
	description,
	onOpenChange,
	onDiscard,
}: {
	open: boolean;
	title: string;
	description: string;
	onOpenChange: (open: boolean) => void;
	onDiscard: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep editing</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onDiscard}>
						Discard
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
