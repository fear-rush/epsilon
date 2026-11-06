import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { call } from "@/core/runtime";
import { useReportStatus } from "@/core/status";

/**
 * Settings → Diagnostics: the engines running now and how the last ones died.
 *
 * The crash records are the files the supervisor wrote, so the page cannot disagree with
 * the disk. Stopping an engine is the same close the process uses on shutdown; the chat's
 * next message starts a new one from its file, which is what the notice in the status line
 * promises.
 */

const diagnosticsQuery = {
	queryKey: ["diagnostics"],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["diagnostics.read"](), { signal }),
	refetchInterval: 5_000,
};

/** What the page substitutes for a terminal-only call. */
const replacementOf = (method: string): string => {
	switch (method) {
		case "custom":
			return "Epsilon uses its own dialogs; the pi-tui component is not drawn.";
		case "onTerminalInput":
			return "The composer owns typing and paste.";
		case "setEditorComponent":
			return "The composer is the editor.";
		case "setFooter":
			return "The browser header and composer rows stand in.";
		case "setHeader":
			return "The browser header stands in.";
		case "setTitle":
			return "The page keeps its own title.";
		case "setWidget":
			return "Only text-line widgets are drawn.";
		case "setWorkingIndicator":
			return "The page draws its own working spinner.";
		default:
			return "This page has no equivalent for the call.";
	}
};

/** Bytes to something a reader can size up. */
const bytes = (value: number): string => {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export function SettingsDiagnostics() {
	const queryClient = useQueryClient();
	const diagnostics = useQuery(diagnosticsQuery);
	const [stopped, setStopped] = useState<string | undefined>(undefined);
	const stop = useMutation({
		mutationFn: (sessionId: string) => call((client) => client["diagnostics.stop"]({ sessionId })),
		onSuccess: (_value, sessionId) => {
			setStopped(sessionId);
			void queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
		},
	});

	// The stop is a fact about a chat that is not on this page, so it stays in the status
	// line after the reader leaves; the chat starts a new engine on its next message.
	useReportStatus(
		"diagnostics",
		stopped === undefined
			? undefined
			: {
					text: `Engine stopped: ${stopped}. Its chat starts a new one on the next message.`,
					tone: "warning",
				},
		undefined,
		{ keep: true },
	);

	if (diagnostics.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Diagnostics" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading engines…" />
				</div>
			</Pane>
		);
	}

	if (diagnostics.error !== null) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Diagnostics" />
				<StatusView error={diagnostics.error} />
			</Pane>
		);
	}

	const view = diagnostics.data;
	const terminals = view.engines.filter((engine) => engine.unsupported.length > 0);

	return (
		<Pane className="flex-1">
			<PaneBar title="Diagnostics" />
			<PaneBody page>
				<Section
					title="Running engines"
					description="One process per live chat. A chat with none starts a new one on its next message."
				>
					{view.engines.length === 0 ? (
						<Row title="No engine is running" />
					) : (
						view.engines.map((engine) => (
							<Row
								key={engine.sessionId}
								title={engine.sessionId}
								description={`pid ${engine.pid} · ${bytes(engine.rss)} · ${engine.tabs} ${engine.tabs === 1 ? "tab" : "tabs"}`}
							>
								{engine.busy ? (
									<Badge variant="warning">busy</Badge>
								) : (
									<Badge variant="outline">idle</Badge>
								)}
								<Button
									size="sm"
									variant="outline"
									disabled={stop.isPending}
									onClick={() => stop.mutate(engine.sessionId)}
								>
									Stop engine
								</Button>
							</Row>
						))
					)}
				</Section>

				<Section
					title="Extension UI"
					description="Terminal-only calls from live extensions, and what this page uses instead."
				>
					{terminals.length === 0 ? (
						<Row
							title="No terminal-only calls"
							description="No live engine has asked for terminal-only UI."
						/>
					) : (
						terminals.flatMap((engine) =>
							engine.unsupported.map((method) => (
								<Row
									key={`${engine.sessionId}-${method}`}
									title={method}
									description={`${replacementOf(method)} · ${engine.sessionId}`}
								/>
							)),
						)
					)}
				</Section>

				<Section
					title="Crashes"
					description="Newest first, written by the supervisor when an engine stopped without being asked."
				>
					{view.crashes.length === 0 ? (
						<Row title="No crashes recorded" />
					) : (
						view.crashes.slice(0, 20).map((crash) => (
							<Row
								key={`${crash.sessionId}-${crash.time}`}
								title={crash.sessionId}
								description={`exit ${crash.exit}${crash.signal === undefined || crash.signal === null ? "" : ` · ${crash.signal}`} · pi ${crash.piVersion}`}
							>
								<span className="inline-flex items-center gap-1 text-meta text-muted-foreground">
									<CircleAlertIcon className="size-4" aria-hidden />
									{crash.time}
								</span>
							</Row>
						))
					)}
				</Section>
			</PaneBody>
		</Pane>
	);
}
