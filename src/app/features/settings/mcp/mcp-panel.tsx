import { useMutation } from "@tanstack/react-query";
import { useMatchRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import type { McpReach, McpScope, McpServerRow } from "#protocol/settings/mcp";
import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettings, useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";

import { setMcpAutoEnableCodemode, setMcpDefaultTool } from "./commands.ts";
import { McpAddDialog } from "./mcp-add-dialog";
import { asScope } from "./mcp-detail.ts";

/**
 * The left side of the MCP editor: the Global or project tab, whether the
 * configured servers can be reached at all, and the servers. Global lists the home's
 * file. A project lists only its own `.pi/mcp.json`.
 */

/** The command or URL a row shows; an invalid entry has none, so its problem shows instead. */
const lineOf = (server: McpServerRow): string =>
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

/**
 * The reaching tools one click can add to `defaultTools`: the ones pi does not start
 * with and whose built-in is not turned off, since a name cannot revive a package the
 * operator disabled.
 */
const offerableDefaults = (reach: McpReach): ReadonlyArray<"codemode" | "tool_search"> =>
	[
		{ tool: "codemode" as const, named: reach.codemodeDefault, off: reach.codemodeDisabled },
		{
			tool: "tool_search" as const,
			named: reach.toolSearchDefault,
			off: reach.toolSearchDisabled,
		},
	]
		.filter((candidate) => !candidate.named && !candidate.off)
		.map((candidate) => candidate.tool);

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
	const stored =
		scope === "project"
			? (reach.autoEnableCodemode.project ?? reach.autoEnableCodemode.global)
			: reach.autoEnableCodemode.global;
	const enabled = stored ?? true;
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
	servers: ReadonlyArray<McpServerRow>;
	selected: { scope: McpScope; name: string } | undefined;
}) {
	return (
		<ListGroup>
			{servers.map((server) => (
				<ListItem
					key={`${server.scope}\0${server.name}`}
					link={{
						params: { name: server.name, scope: server.scope },
						search: true,
						to: "/settings/mcp/$scope/$name",
					}}
					name={server.name}
					description={lineOf(server)}
					selected={selected?.scope === server.scope && selected.name === server.name}
					dimmed={!server.enabled}
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
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);

	const servers = settings.data?.mcp.servers ?? [];
	const view = settings.data?.mcp;
	const reach = view?.reach;
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
	const defaultTool = useMutation({
		mutationFn: (input: { tool: "codemode" | "tool_search"; enabled: boolean }) =>
			setMcpDefaultTool(projectPath, input),
		onSuccess: () => refresh(),
	});
	const live = settings.data?.mcpLive;
	const mcpDisabled = view?.mcpDisabled;
	const unreachable = reach?.unreachable ?? [];
	const problems = view?.problems ?? [];
	/**
	 * What the files promise and what the live engines do can disagree: an
	 * extension can replace codemode or tool_search without a `settings.json` flag.
	 * When a live session has neither reaching tool, the panel says so with the
	 * names it can see, instead of trusting the file.
	 */
	const unlisted =
		live === undefined
			? []
			: live.servers.filter((entry) => !servers.some((row) => row.name === entry.name));
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
	/** The list's alerts; none means no slot, so the stack under the band stays tight. */
	const notices = [
		problems.length === 0 ? undefined : (
			<Notice key="read" tone="danger">
				{problems.join(" ")}
			</Notice>
		),
		mcpDisabled === true ? (
			<Notice key="disabled" tone="warning">
				MCP is off in settings.json (<code>-builtin:mcp</code>).
			</Notice>
		) : undefined,
		mcpDisabled === true || unreachable.length === 0 || reach === undefined ? undefined : (
			<Notice key="unreachable" tone="warning">
				<div className="grid gap-2">
					<span>
						The model cannot call {unreachable.map((server) => server.name).join(", ")}:{" "}
						{unreachableReason(reach)}.
					</span>
					{reach.defaultToolsProject ? (
						<span>
							This project sets <code>defaultTools</code> itself, so add the tool in its{" "}
							<code>.pi/settings.json</code>.
						</span>
					) : (
						<span className="flex flex-wrap gap-2">
							{offerableDefaults(reach).map((tool) => (
								<Button
									key={tool}
									size="sm"
									variant="outline"
									disabled={defaultTool.isPending}
									onClick={() => defaultTool.mutate({ enabled: true, tool })}
								>
									Name {tool} in defaultTools
								</Button>
							))}
						</span>
					)}
				</div>
			</Notice>
		),
		mcpDisabled === true || unreachable.length > 0 || stalled.length === 0 ? undefined : (
			<Notice key="stalled" tone="warning">
				The model cannot call {stalled.map((server) => server.name).join(", ")}: no live session has{" "}
				<code>codemode</code> or <code>tool_search</code>.
			</Notice>
		),
		codemode.error === null ? undefined : (
			<Notice key="codemode" tone="danger">
				{codemode.error.message}
			</Notice>
		),
		defaultTool.error === null ? undefined : (
			<Notice key="default-tool" tone="danger">
				{defaultTool.error.message}
			</Notice>
		),
	].filter((notice) => notice !== undefined);

	return (
		<>
			<ListPane
				title="MCP servers"
				count={own.length}
				error={settings.error}
				notices={notices.length === 0 ? undefined : <div className="grid gap-2">{notices}</div>}
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
								onToggle={(target, enabled) => codemode.mutate({ enabled, scope: target })}
							/>
						)}
						<Button type="button" variant="outline" onClick={() => setAdding(true)}>
							<PlusIcon />
							{scope === "global"
								? "Add MCP server"
								: `Add to ${settings.data?.project?.name ?? "project"}`}
						</Button>
					</>
				}
			>
				<ServerGroup servers={visible} selected={selected} />
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
