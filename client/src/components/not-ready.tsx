import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import type { Readiness } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

/**
 * The unsupported state, centred on every page: a deployment with no usable model
 * names the missing step and links to the settings page that fixes it. Silence
 * here is what made a fresh home look broken (AGENTS.md rule 7, docs/ui.md).
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
					<div>
						<Link to="/settings/providers" className={buttonVariants()}>
							Open Settings
						</Link>
					</div>
				</AlertDescription>
			</Alert>
		</div>
	);
}
