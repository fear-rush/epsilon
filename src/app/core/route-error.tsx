import type { ErrorComponentProps } from "@tanstack/react-router";

import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";

/**
 * What a page shows when a render throws. Without it the router's own screen is the only
 * thing between a bug and a blank page, and the product's language is lost.
 *
 * Mounted on each layout, so the shell around the page stays while the page itself is
 * replaced.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
	// What is thrown is not always an Error, and the translator needs one. A render crash has
	// no named cause, so its words are the translator's own; the page's job is the retry.
	const failure = error instanceof Error ? error : new Error("A route failed to render.");
	return (
		<StatusView
			error={failure}
			action={
				<Button variant="outline" onClick={reset}>
					Try again
				</Button>
			}
		/>
	);
}
