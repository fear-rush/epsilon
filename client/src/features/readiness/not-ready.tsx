import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import type { Readiness } from "@/api/types";

/**
 * The unsupported state, centred on every page: an Epsilon with no usable model
 * names the missing step and the home, and links to the settings page that fixes it.
 * Silence here is what made a fresh home look broken (AGENTS.md, Invariants).
 *
 * The action sits outside `AlertDescription`, which underlines every link it holds:
 * a button-shaped link must not inherit that.
 */
export function NotReady({ state }: { state: Extract<Readiness, { ready: false }> }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center p-6">
			<Alert className="max-w-md gap-3 px-6 py-5">
				<TriangleAlertIcon />
				<AlertTitle>Epsilon cannot run a turn yet</AlertTitle>
				<AlertDescription>
					{state.detail} {state.fix}
				</AlertDescription>
				<code className="col-start-2 block truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
					{state.home}
				</code>
				<div className="col-start-2 mt-1">
					<Link to="/settings/providers" className={buttonVariants()}>
						Open Settings
					</Link>
				</div>
			</Alert>
		</div>
	);
}
