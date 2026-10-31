import { useMatchRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { McpScope } from "shared";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { useSettings, useSettingsProject } from "@/features/settings/queries";
import { useSettingsRefresh } from "@/features/settings/queries";
import { setMcpAutoEnableCodemode } from "@/api/endpoints";
import type { McpReach, McpServerView } from "@/api/types";
import { McpAddDialog } from "./mcp-add-dialog";
import { asScope } from "./mcp-detail";

/**
 * The left side of the MCP editor: the Global or project tab, whether the
 * configured servers can be reached at all, the servers, and the add route.
 * Global lists the home's file. A project lists only its own `.pi/mcp.json`.
 */

/** The command or URL a row shows; an invalid entry has none, so its problem shows instead. */
const lineOf = (server: McpServerView): string =>
	server.kind === "invalid" ? server.problem : server.target;

/** Why no reaching tool will be active, in the operator's own words. */
const unreachableReason = (reach: McpReach): string => {
	if (reach.codemodeDisabled) {
		return "codemode is off in settings.json";
	}
	if (reach.toolSearchDisabled) {
		return "tool-search is off in settings.json";
	}
	return "codemode auto-enable is off";
};

/** The switch that decides codemode auto-enable, written to the file the tab shows. */
function CodemodeBlock({
	reach,
	scope,
	pending,
	onToggle,
}: {
	reach: McpReach;
	/** The tab: Global writes the home's file, a project its own. */
	scope: McpScope;
	pending: boolean;
	onToggle: (scope: McpScope, enabled: boolean) => void;
}) {
	const enabled =
		(scope === "project"
			? (reach.autoEnableCodemode.project ?? reach.autoEnableCodemode.global)
			: reach.autoEnableCodemode.global) !== false;
	return (
		<label className="flex items-center justify-between gap-2" htmlFor="mcp-auto-codemode">
			<span className="text-body">Auto-enable codemode</span>
			<Switch
				id="mcp-auto-codemode"
				size="sm"
				checked={enabled}
				disabled={pending}
				onCheckedChange={(checked) => onToggle(scope, checked)}
			/>
		</label>
	);
}

function ServerGroup({
	servers,
	selected,
}: {
	servers: McpServerView[];
	selected: { scope: McpScope; name: string } | undefined;
}) {
	return (
		<ListGroup>
			{servers.map((server) => (
				<ListItem
					key={`${server.scope}\0${server.name}`}
					link={{
						to: "/settings/mcp/$scope/$name",
						params: { scope: server.scope, name: server.name },
						search: true,
					}}
					name={server.name}
					description={lineOf(server)}
					selected={selected?.scope === server.scope && selected.name === server.name}
					dimmed={server.enabled === false}
				/>
			))}
		</ListGroup>
	);
}

function McpPanel({ selected }: { selected: { scope: McpScope; name: string } | undefined }) {
	const settings = useSettings();
	const refresh = useSettingsRefresh();
	const projectPath = useSettingsProject();
	const scope: McpScope = projectPath === undefined ? "global" : "project";
	const motion = {
		key: projectPath ?? "global",
		className: projectPath === undefined ? "animate-enter-left" : "animate-enter-right",
	};
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);

	const servers = settings.data?.mcp ?? [];
	const project = settings.data?.project ?? null;
	const needle = query.trim().toLowerCase();
	// A project tab lists only the project's own entries; the Global tab lists the home's file.
	const own = servers.filter((server) => server.scope === scope);
	const visible = own.filter((server) =>
		[server.name, lineOf(server), server.kind === "invalid" ? "" : (server.description ?? "")]
			.join(" ")
			.toLowerCase()
			.includes(needle),
	);

	const codemode = useMutation({
		mutationFn: (input: { scope: McpScope; enabled: boolean }) =>
			setMcpAutoEnableCodemode(projectPath, input),
		onSuccess: () => refresh(),
	});
	const reach = settings.data?.mcpReach;
	const live = settings.data?.mcpLive;
	const mcpDisabled = settings.data?.mcpDisabled;
	const unreachable = reach?.unreachable ?? [];
	/**
	 * What the files promise and what the live engines do can disagree: an
	 * extension can replace codemode or tool_search without a `settings.json` flag.
	 * When a live session has neither reaching tool, the panel says so with the
	 * names it can see, instead of trusting the file.
	 */
	const unlisted =
		live === undefined
			? []
			: live.servers.filter((entry) => !servers.some((v) => v.name === entry.name));
	const stalled =
		live !== undefined && live.sessions > 0 && !live.codemode && !live.toolSearch
			? servers.filter(
					(server) =>
						server.kind !== "invalid" &&
						server.enabled &&
						server.needsIndirect &&
						(server.kind !== "server" || server.relation !== "replaced-by-project"),
				)
			: [];

	return (
		<>
			<ListPane
				title="MCP servers"
				count={own.length}
				error={settings.error}
				notices={
					<div className="grid gap-2">
						{settings.data?.error !== undefined && (
							<Notice tone="error">{settings.data.error}</Notice>
						)}
						{mcpDisabled === true && (
							<Notice tone="warning">
								MCP is off in settings.json (<code>-builtin:mcp</code>).
							</Notice>
						)}
						{mcpDisabled !== true && unreachable.length > 0 && reach !== undefined && (
							<Notice tone="warning">
								The model cannot call {unreachable.map((server) => server.name).join(", ")}:{" "}
								{unreachableReason(reach)}.
							</Notice>
						)}
						{mcpDisabled !== true && unreachable.length === 0 && stalled.length > 0 && (
							<Notice tone="warning">
								The model cannot call {stalled.map((server) => server.name).join(", ")}: no live
								session has <code>codemode</code> or <code>tool_search</code>.
							</Notice>
						)}
						{codemode.error !== null && <Notice tone="error">{codemode.error.message}</Notice>}
					</div>
				}
				scope="/settings/mcp"
				query={query}
				onQueryChange={setQuery}
				searchLabel="Search MCP servers"
				pending={settings.isPending}
				pendingLabel="Reading MCP servers…"
				empty={
					visible.length === 0
						? own.length === 0
							? scope === "global"
								? "No MCP server configured yet."
								: "No servers in this project."
							: "Nothing matches."
						: undefined
				}
				footerStacked
				footer={
					<>
						{reach !== undefined && (
							<CodemodeBlock
								reach={reach}
								scope={scope}
								pending={codemode.isPending}
								onToggle={(target, enabled) => codemode.mutate({ scope: target, enabled })}
							/>
						)}
						<Button type="button" variant="outline" onClick={() => setAdding(true)}>
							<PlusIcon />
							{scope === "global" ? "Add MCP server" : `Add to ${project?.name ?? "project"}`}
						</Button>
					</>
				}
			>
				<div key={motion.key} className={cn("min-w-0", motion.className)}>
					<ServerGroup servers={visible} selected={selected} />
				</div>
				{unlisted.length > 0 && (
					<ListGroup title="Registered by an extension">
						{unlisted.map((server) => (
							<ListItem key={server.name} name={server.name} />
						))}
					</ListGroup>
				)}
			</ListPane>
			<McpAddDialog open={adding} onOpenChange={setAdding} />
		</>
	);
}

/** The route owns which server is selected; the panel only draws it. */
export function McpLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/mcp/$scope/$name" });
	const selected =
		matched === false ? undefined : { scope: asScope(matched.scope), name: matched.name };
	return <MasterDetail editing={selected !== undefined} list={<McpPanel selected={selected} />} />;
}
