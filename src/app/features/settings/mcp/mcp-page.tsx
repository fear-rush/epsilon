import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { McpServerRow } from "#protocol/settings/mcp";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { call } from "@/core/runtime";

/**
 * Settings → MCP servers: pi's two files, read as pi reads them.
 *
 * A server is either a definition, a project override of one, or an entry pi skips. The
 * page can switch a definition on or off and remove one; the values a server needs stay in
 * the file, and a project override is edited where it lives.
 */
const mcpQuery = {
	queryKey: ["config", "mcp", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["settings.mcp.list"]({ folder: null }), { signal }),
};

/** One row's identity in its file, which is how a write names it. */
const targetOf = (row: McpServerRow) => ({ folder: null, name: row.name, scope: row.scope });

export function SettingsMcp() {
	const queryClient = useQueryClient();
	const mcp = useQuery(mcpQuery);

	const refresh = (): void => {
		void queryClient.invalidateQueries({ queryKey: ["config"] });
	};
	const setEnabled = useMutation({
		mutationFn: (input: { row: McpServerRow; enabled: boolean }) =>
			call((client) =>
				client["settings.mcp.setEnabled"]({ ...targetOf(input.row), enabled: input.enabled }),
			),
		onSuccess: refresh,
	});
	const remove = useMutation({
		mutationFn: (row: McpServerRow) =>
			call((client) => client["settings.mcp.remove"](targetOf(row))),
		onSuccess: refresh,
	});

	if (mcp.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="MCP servers" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading pi's MCP files…" />
				</div>
			</Pane>
		);
	}

	if (mcp.error !== null) {
		return (
			<Pane className="flex-1">
				<PaneBar title="MCP servers" />
				<StatusView error={mcp.error} />
			</Pane>
		);
	}

	const view = mcp.data;

	return (
		<Pane className="flex-1">
			<PaneBar title="MCP servers" meta={`${view.servers.length}`} />
			<PaneBody page>
				{view.problems.map((problem) => (
					<Notice key={problem} tone="warning" title="A file pi could not read">
						{problem}
					</Notice>
				))}
				{setEnabled.error !== null && (
					<Notice error={setEnabled.error} title="The switch was not written" />
				)}
				{remove.error !== null && (
					<Notice error={remove.error} title="The server was not removed" />
				)}

				<Section
					title="Servers"
					description="pi starts an enabled server for every chat that can reach it."
				>
					{view.servers.length === 0 ? (
						<Row title="No MCP server" description="Add one in pi's mcp.json, or use the CLI." />
					) : (
						view.servers.map((server) => (
							<Row
								key={`${server.scope}:${server.name}:${server.kind}`}
								title={server.name}
								description={describe(server)}
							>
								<Badge variant="outline">{server.scope}</Badge>
								{server.kind === "invalid" ? (
									<Badge variant="destructive">{server.problem}</Badge>
								) : server.kind === "override" ? (
									<Badge variant="secondary">override</Badge>
								) : (
									<Switch
										aria-label={`${server.name} enabled`}
										checked={server.enabled}
										onCheckedChange={(enabled) => setEnabled.mutate({ enabled, row: server })}
									/>
								)}
								<Button
									size="sm"
									variant="outline"
									disabled={remove.isPending}
									onClick={() => remove.mutate(server)}
								>
									Remove
								</Button>
							</Row>
						))
					)}
				</Section>
			</PaneBody>
		</Pane>
	);
}

/** What a row says under its name: the target, or why pi skips it. */
function describe(server: McpServerRow): string {
	if (server.kind === "invalid") return server.problem;
	if (server.kind === "override") return `overrides ${server.overrideKeys.join(", ")}`;
	const via = server.transport === "stdio" ? "stdio" : "http";
	const extra = server.needsIndirect ? " · needs codemode or tool_search" : "";
	return `${via} · ${server.target}${extra}`;
}
