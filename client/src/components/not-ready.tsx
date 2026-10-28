import { TriangleAlertIcon } from "lucide-react";
import type { Readiness } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The unsupported state, centred on every page: a deployment with no usable model
 * says which step is missing and which command fixes it, and offers no composer to
 * type into. Silence here is what made a fresh home look broken (AGENTS.md rule 7,
 * docs/ui.md "Not ready").
 */
export function NotReady({ state }: { state: Extract<Readiness, { ready: false }> }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center p-6">
			<Alert className="max-w-lg">
				<TriangleAlertIcon />
				<AlertTitle>This deployment cannot run a turn yet</AlertTitle>
				<AlertDescription>
					<p>{state.detail}</p>
					<p>{state.fix}</p>
					<code className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
						{state.home}
					</code>
				</AlertDescription>
			</Alert>
		</div>
	);
}
