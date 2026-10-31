import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Block } from "@tanstack/react-router";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

/**
 * A new entry is a route with a draft, so leaving it needs its own exit. The
 * confirmation is destructive because confirming throws the whole draft away.
 */

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

/**
 * The router's leave guard for a form with unsaved changes. Stay keeps the
 * draft; Discard proceeds with the blocked navigation. The dialog mounts already
 * open, so it opens on the next frame and waits for its close transition before
 * it lets the route change unmount it.
 */

const CLOSE_MS = 180;

function DiscardDialog({
	subject,
	onStay,
	onDiscard,
}: {
	/** The noun in the sentence: "provider" or "MCP server". */
	subject: string;
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
						This {subject} has changes that are not saved. Leaving now loses them.
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

/**
 * The one destructive confirmation every list uses. A page keeps its own mutation
 * and passes its pending state; only the dialog, the spinner and the error line
 * are shared, so a new list cannot invent a different confirmation.
 */

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

/**
 * Stops a route change or a tab close while the form has unsaved changes, and
 * asks whether to discard them. `blocked` comes from `useDraftForm`.
 */
export function UnsavedChangesBlock({
	blocked,
	subject,
}: {
	blocked: () => boolean;
	subject: string;
}) {
	return (
		<Block shouldBlockFn={blocked} enableBeforeUnload={blocked} withResolver>
			{({ status, proceed, reset }) =>
				status === "blocked" ? (
					<DiscardDialog subject={subject} onStay={reset} onDiscard={proceed} />
				) : null
			}
		</Block>
	);
}
