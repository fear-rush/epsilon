import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import type { Readiness } from "#protocol/settings/readiness";
import { StatusView } from "@/components/patterns/status/status-view";
import { buttonVariants } from "@/components/ui/button";

/**
 * The unsupported state, centred on every page: an Epsilon with no usable model names the
 * missing step and links to the settings page that fixes it. Silence here is what made a
 * fresh home look broken.
 */
export function NotReady({ state }: { state: Extract<Readiness, { ready: false }> }) {
	const invalid = state.status === "invalid";
	return (
		<StatusView
			icon={invalid ? CircleAlertIcon : TriangleAlertIcon}
			tone={invalid ? "danger" : "warning"}
			title={invalid ? "The agent configuration is broken" : "Epsilon cannot run a turn yet"}
			line={`${state.detail} ${state.fix}`}
			action={
				<Link to="/settings/providers" className={buttonVariants()}>
					Open Settings
				</Link>
			}
		/>
	);
}
