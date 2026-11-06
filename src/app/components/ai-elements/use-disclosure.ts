import { useState } from "react";

/**
 * The open state of a Trace, in the one shape every AI element uses: the caller may
 * control it (a chat keeps one map for all its tool cards) or leave it alone, and the
 * element opens by default only while it is running.
 */
export function useDisclosure({
	open,
	defaultOpen = false,
	onOpenChange,
}: {
	open?: boolean | undefined;
	defaultOpen?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
}) {
	const [chosen, setChosen] = useState<boolean>();
	return {
		open: chosen ?? open ?? defaultOpen,
		setOpen: (next: boolean) => {
			setChosen(next);
			onOpenChange?.(next);
		},
	};
}
