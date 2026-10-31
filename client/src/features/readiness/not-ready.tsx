import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { StatusView } from "@/components/patterns/status/status-view";
import type { Readiness } from "@/api/types";

/**
 * The unsupported state, centred on every page: an Epsilon with no usable model
 * names the missing step and links to the settings page that fixes it. Silence
 * here is what made a fresh home look broken (AGENTS.md, Invariants).
 */
export function NotReady({ state }: { state: Extract<Readiness, { ready: false }> }) {
	return (
		<StatusView
			icon={TriangleAlertIcon}
			tone="warning"
			title="Epsilon cannot run a turn yet"
			line={`${state.detail} ${state.fix}`}
			action={
				<Link to="/settings/providers" className={buttonVariants()}>
					Open Settings
				</Link>
			}
		/>
	);
}
