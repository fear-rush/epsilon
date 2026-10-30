/**
 * Motion for a dialog whose mount its own state decides, such as one opened from a
 * list row. Base UI skips the entry transition of a dialog that mounts already open,
 * and the caller unmounts it the moment it closes, so both animations are lost. This
 * opens it on the next frame and runs the caller's action only after the exit has
 * played, which is when dropping the state that mounted it is safe.
 */
import { useEffect, useRef, useState } from "react";

/** The exit transition the registry dialogs run; the action waits for it. */
const CLOSE_MS = 180;

export type DialogMotion = {
	/** The dialog's `open`, true once the frame that lets the entry play has passed. */
	open: boolean;
	/** Close, then act. The action is what unmounts the dialog, or sends its answer. */
	close: (action: () => void) => void;
};

export function useDialogMotion(): DialogMotion {
	const [open, setOpen] = useState(false);
	const exit = useRef<number | undefined>(undefined);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setOpen(true));
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(exit.current);
		};
	}, []);

	const close = (action: () => void) => {
		// The dialog is still on screen while it leaves, so a second click would run the
		// action twice: submit a model twice, or answer a question twice.
		if (!open) return;
		setOpen(false);
		window.clearTimeout(exit.current);
		exit.current = window.setTimeout(action, CLOSE_MS);
	};

	return { open, close };
}
