import { Block } from "@tanstack/react-router";

import { DiscardDialog } from "./discard-dialog";

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
