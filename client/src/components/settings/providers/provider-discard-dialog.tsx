/**
 * The router's leave guard for a provider form with unsaved changes. Stay keeps
 * the draft; Discard proceeds with the blocked navigation. The dialog mounts
 * already open, so it opens on the next frame and waits for its close transition
 * before it lets the route change unmount it.
 */
import { useEffect, useRef, useState } from "react";

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

const CLOSE_MS = 180;

export function ProviderDiscardDialog({
	onStay,
	onDiscard,
}: {
	onStay: () => void;
	onDiscard: () => void;
}) {
	const [shown, setShown] = useState(false);
	const pending = useRef<(() => void) | undefined>(undefined);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setShown(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	const change = (open: boolean) => {
		if (open) {
			setShown(true);
			return;
		}
		setShown(false);
		const action = pending.current ?? onStay;
		pending.current = undefined;
		window.setTimeout(action, CLOSE_MS);
	};

	return (
		<AlertDialog open={shown} onOpenChange={change}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
					<AlertDialogDescription>
						This provider has changes that are not saved. Leaving now loses them.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						disabled={!shown}
						onClick={() => {
							pending.current = onStay;
						}}
					>
						Stay
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={!shown}
						onClick={() => {
							pending.current = onDiscard;
							change(false);
						}}
					>
						Discard changes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
