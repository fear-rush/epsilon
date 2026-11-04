import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { agentHome, call } from "@/runtime";

/**
 * The landing page: what this server runs, and what its home holds.
 *
 * It reads one snapshot, the same assembly the settings pages read, so a count here
 * cannot disagree with the list it links to. The chat surface replaces this landing once
 * the conversation screen exists.
 */

export const overviewQuery = {
	queryKey: ["config", "snapshot", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.snapshot"]({ folder: null }), { signal }),
};

const homeQuery = {
	queryKey: ["agent-home"],
	queryFn: () => agentHome(),
	staleTime: Infinity,
};

export function Overview() {
	const snapshot = useQuery(overviewQuery);
	const home = useQuery(homeQuery);

	if (snapshot.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Overview" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading the agent home…" />
				</div>
			</Pane>
		);
	}

	if (snapshot.error !== null) {
		const view = errorView(snapshot.error);
		return (
			<Pane className="flex-1">
				<PaneBar title="Overview" />
				<StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />
			</Pane>
		);
	}

	const data = snapshot.data;

	return (
		<Pane className="flex-1">
			<PaneBar title="Overview" />
			<PaneBody page>
				<Section
					title="This Epsilon"
					description="The folder this server holds, and the agent it runs from there."
				>
					<Row title="Agent home" description={home.data ?? "Asking the server…"} />
					<Row title="Readiness" description="pi's own model runtime answered that a turn can run.">
						<Badge variant="secondary">Ready</Badge>
					</Row>
				</Section>

				<Section
					title="Configured here"
					description="Counted from the snapshot the settings pages read."
				>
					<Row title="Providers" description="Model providers pi can reach.">
						<Count to="/settings/providers" value={data.providers.providers.length} />
					</Row>
					<Row title="MCP servers" description="Servers pi starts for a chat.">
						<Count to="/settings/mcp" value={data.mcp.servers.length} />
					</Row>
					<Row title="Skills" description="Skill documents in this home and its packages.">
						<Count to="/settings/skills" value={data.skills.skills.length} />
					</Row>
					<Row title="Packages" description="Packages pi loads resources from.">
						<Count to="/settings/packages" value={data.packages.packages.length} />
					</Row>
				</Section>

				<Section
					title="Chats"
					description="The conversation screen arrives with the next step of the rebuild."
				>
					<Row
						title="Nothing is lost in the meantime"
						description="Sessions stay in pi's own files under the agent home above; this page only reads them."
					/>
				</Section>
			</PaneBody>
		</Pane>
	);
}

function Count({ to, value }: { to: string; value: number }) {
	return (
		<Link to={to} className="text-body text-muted-foreground underline-offset-4 hover:underline">
			{value}
		</Link>
	);
}
