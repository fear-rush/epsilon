import { Link, useNavigate, useMatchRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import type { McpScope } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MasterListPanel } from "@/features/settings/kit/master-list-panel";
import { useSettings } from "@/features/settings/queries";
import { useSettingsRefresh } from "@/features/settings/queries";
import { setMcpAutoEnableCodemode, setMcpServerEnabled } from "@/api/endpoints";
import type { McpLive, McpReach, McpServerView } from "@/api/types";
import { MasterDetailLayout } from "@/features/settings/kit/master-detail-layout";
import { asScope } from "./mcp-detail";

/**
 * The left side of the MCP editor: whether the configured servers can be reached
 * at all, this project's servers, the global servers, and the add route. A server
 * appears under the file it lives in; the same name can appear twice, once per
 * file, and the project entry wins where it does.
 */

type RowBadge = { label: string; variant: "warning" | "outline" | "secondary" };

const badgeFor = (server: McpServerView): RowBadge | undefined => {
	switch (server.kind) {
		case "invalid":
			return { label: "Invalid", variant: "warning" };
		case "override":
			return { label: "Override", variant: "outline" };
		case "server":
			switch (server.relation) {
				case "overridden-by-project":
					return { label: "Changed here", variant: "outline" };
				case "replaced-by-project":
					return { label: "Replaced", variant: "outline" };
				case "replaces-global":
				case undefined:
					return server.enabled ? undefined : { label: "Off", variant: "secondary" };
				default:
					return server.relation satisfies never;
			}
		default:
			return server satisfies never;
	}
};

/** The command or URL a row shows; an invalid entry has none and no transport. */
const targetOf = (server: McpServerView): string =>
	server.kind === "invalid" ? "" : server.target;

const targetLine = (server: McpServerView, tools: number | undefined): string => {
	const transport = server.kind === "invalid" ? "unread" : server.transport;
	const target = targetOf(server);
	const line = target === "" ? transport : `${transport} · ${target}`;
	if (tools === undefined) return line;
	return `${line} · ${tools} ${tools === 1 ? "tool" : "tools"}`;
};

/** Why no reaching tool will be active, in the operator's own words. */
const unreachableReason = (reach: McpReach): string => {
	if (reach.codemodeDisabled) {
		return 'settings.json turns the codemode built-in off with "-builtin:codemode"';
	}
	if (reach.toolSearchDisabled) {
		return 'settings.json turns the tool-search built-in off with "-builtin:tool-search"';
	}
	return "codemode auto-enable is off and settings.json defaultTools does not name codemode";
};

/**
 * pi activates codemode for a connecting codemode server only while
 * `autoEnableCodemode` is on, and `tool_search` for a deferred one. This is the
 * switch that decides it, written to the file that decides it today.
 */
function CodemodeBlock({
	reach,
	pending,
	onToggle,
}: {
	reach: McpReach;
	pending: boolean;
	onToggle: (scope: McpScope, enabled: boolean) => void;
}) {
	const scope: McpScope = reach.autoEnableCodemode.project !== undefined ? "project" : "global";
	const enabled = (reach.autoEnableCodemode.project ?? reach.autoEnableCodemode.global) !== false;
	const file = scope === "project" ? "this project's .pi/mcp.json" : "the global mcp.json";
	return (
		<div className="grid gap-1">
			<label className="flex items-center justify-between gap-2" htmlFor="mcp-auto-codemode">
				<span className="text-xs font-medium">Auto-enable codemode</span>
				<Checkbox
					id="mcp-auto-codemode"
					checked={enabled}
					disabled={pending}
					onCheckedChange={(checked) => onToggle(scope, checked === true)}
				/>
			</label>
			<p className="text-xs text-muted-foreground">
				pi activates codemode when a codemode server connects. Written to {file}
				{reach.codemodeDefault
					? "; settings.json defaultTools already names codemode, so it stays reachable either way."
					: "."}
			</p>
		</div>
	);
}

function ServerRow({
	server,
	selected,
	tools,
	onToggle,
	toggling,
}: {
	server: McpServerView;
	selected: boolean;
	/** Tools the server registered in a live session; undefined when no session reports it. */
	tools: number | undefined;
	onToggle: (server: McpServerView, enabled: boolean) => void;
	toggling: boolean;
}) {
	const badge = badgeFor(server);
	return (
		<div
			className={cn(
				"flex items-center gap-1 rounded-md pr-1 transition-colors",
				selected ? "bg-muted" : "hover:bg-muted/60",
			)}
		>
			<Link
				to="/settings/mcp/$scope/$name"
				params={{ scope: server.scope, name: server.name }}
				className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-2"
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="block min-w-0 flex-1 truncate text-sm font-medium">{server.name}</span>
					{badge !== undefined && <Badge variant={badge.variant}>{badge.label}</Badge>}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{targetLine(server, tools)}
				</span>
			</Link>
			<Checkbox
				checked={server.enabled}
				disabled={toggling}
				aria-label={`${server.enabled ? "Turn off" : "Turn on"} ${server.name}`}
				onCheckedChange={(checked) => onToggle(server, checked === true)}
			/>
		</div>
	);
}

function ServerGroup({
	title,
	description,
	servers,
	selected,
	live,
	onToggle,
	toggling,
}: {
	title: string;
	description?: string;
	servers: McpServerView[];
	selected: { scope: McpScope; name: string } | undefined;
	live: McpLive | undefined;
	onToggle: (server: McpServerView, enabled: boolean) => void;
	toggling: boolean;
}) {
	const on = servers.filter((server) => server.enabled).length;
	return (
		<div className="grid gap-1">
			<div className="flex items-baseline justify-between px-2 pt-3 pb-1">
				<span className="text-xs font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">{`${on}/${servers.length}`}</span>
			</div>
			{description !== undefined && (
				<p className="px-2 pb-1 text-xs text-muted-foreground">{description}</p>
			)}
			{servers.length === 0 ? (
				<p className="px-2 py-2 text-xs text-muted-foreground">Nothing here.</p>
			) : (
				servers.map((server) => (
					<ServerRow
						key={`${server.scope}\0${server.name}`}
						server={server}
						selected={selected?.scope === server.scope && selected.name === server.name}
						tools={
							server.kind === "server" && server.relation === "replaced-by-project"
								? undefined
								: live?.servers.find((entry) => entry.name === server.name)?.tools
						}
						onToggle={onToggle}
						toggling={toggling}
					/>
				))
			)}
		</div>
	);
}

function McpPanel({
	selected,
	editing,
}: {
	selected: { scope: McpScope; name: string } | undefined;
	editing: boolean;
}) {
	const settings = useSettings();
	const refresh = useSettingsRefresh();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");

	const servers = settings.data?.mcp ?? [];
	const projectDir = settings.data?.projectDir;
	const needle = query.trim().toLowerCase();
	const visible = servers.filter((server) =>
		[server.name, targetOf(server), server.kind === "invalid" ? "" : (server.description ?? "")]
			.join(" ")
			.toLowerCase()
			.includes(needle),
	);
	const project = visible.filter((server) => server.scope === "project");
	const global = visible.filter((server) => server.scope === "global");

	const toggle = useMutation({
		mutationFn: (input: { scope: McpScope; name: string; enabled: boolean }) =>
			setMcpServerEnabled(input),
		onSuccess: () => refresh(),
	});
	const codemode = useMutation({
		mutationFn: (input: { scope: McpScope; enabled: boolean }) => setMcpAutoEnableCodemode(input),
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
		<MasterListPanel
			title="MCP servers"
			count={servers.length}
			editing={editing}
			error={settings.data?.error}
			notices={
				<>
					{settings.data?.mcpDisabled === true && (
						<div className="shrink-0 px-3 py-2">
							<Alert>
								<TriangleAlertIcon />
								<AlertDescription className="text-xs">
									MCP is turned off in settings.json with <code>-builtin:mcp</code>, so no session
									connects these servers. Changes here are still saved.
								</AlertDescription>
							</Alert>
						</div>
					)}
					{mcpDisabled !== true && unreachable.length > 0 && reach !== undefined && (
						<div className="shrink-0 px-3 py-2">
							<Alert>
								<TriangleAlertIcon />
								<AlertDescription className="text-xs">
									The model cannot call {unreachable.map((server) => server.name).join(", ")}: pi
									reaches {unreachable.length === 1 ? "its tools" : "their tools"} only through{" "}
									<code>codemode</code> or <code>tool_search</code>, and {unreachableReason(reach)}.
								</AlertDescription>
							</Alert>
						</div>
					)}
					{mcpDisabled !== true && unreachable.length === 0 && stalled.length > 0 && (
						<div className="shrink-0 px-3 py-2">
							<Alert>
								<TriangleAlertIcon />
								<AlertDescription className="text-xs">
									No live session has <code>codemode</code> or <code>tool_search</code> active, so
									the model cannot call {stalled.map((server) => server.name).join(", ")}. Check{" "}
									<code>settings.json</code> for <code>-builtin:codemode</code>,{" "}
									<code>-builtin:tool-search</code>, or an extension that replaces them.
								</AlertDescription>
							</Alert>
						</div>
					)}
					{toggle.error !== null && (
						<div className="shrink-0 px-3 py-2">
							<Alert variant="destructive">
								<AlertDescription className="text-xs">{toggle.error.message}</AlertDescription>
							</Alert>
						</div>
					)}
					{codemode.error !== null && (
						<div className="shrink-0 px-3 py-2">
							<Alert variant="destructive">
								<AlertDescription className="text-xs">{codemode.error.message}</AlertDescription>
							</Alert>
						</div>
					)}
				</>
			}
			query={query}
			onQueryChange={setQuery}
			searchLabel="Search MCP servers"
			pending={settings.isPending}
			pendingLabel="Reading MCP servers…"
			empty={
				visible.length === 0
					? servers.length === 0
						? "No MCP server configured yet."
						: "Nothing matches."
					: undefined
			}
			footer={
				<div className="grid gap-3">
					{reach !== undefined && (
						<CodemodeBlock
							reach={reach}
							pending={codemode.isPending}
							onToggle={(scope, enabled) => codemode.mutate({ scope, enabled })}
						/>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
							<PlusIcon />
							Add MCP server
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-(--anchor-width)">
							<DropdownMenuItem
								onClick={() =>
									void navigate({ to: "/settings/mcp/$scope/new", params: { scope: "global" } })
								}
							>
								Global
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									void navigate({ to: "/settings/mcp/$scope/new", params: { scope: "project" } })
								}
							>
								This project
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			}
		>
			<ServerGroup
				title="This project"
				description={projectDir}
				servers={project}
				selected={selected}
				live={live}
				onToggle={(server, enabled) =>
					toggle.mutate({ scope: server.scope, name: server.name, enabled })
				}
				toggling={toggle.isPending}
			/>
			<ServerGroup
				title="Global"
				servers={global}
				selected={selected}
				live={live}
				onToggle={(server, enabled) =>
					toggle.mutate({ scope: server.scope, name: server.name, enabled })
				}
				toggling={toggle.isPending}
			/>
			{unlisted.length > 0 && (
				<div className="grid gap-1">
					<span className="px-2 pt-3 pb-1 text-xs font-medium">Registered by an extension</span>
					<p className="px-2 pb-1 text-xs text-muted-foreground">
						A loaded extension registered these for its session with{" "}
						<code>pi.registerMcpServer()</code>. They are in neither file, and changes to them apply
						only to that session.
					</p>
					{unlisted.map((server) => (
						<div key={server.name} className="flex items-center gap-2 px-2 py-1">
							<span className="min-w-0 flex-1 truncate text-sm">{server.name}</span>
							<span className="text-xs text-muted-foreground">
								{server.tools} {server.tools === 1 ? "tool" : "tools"}
							</span>
						</div>
					))}
				</div>
			)}
		</MasterListPanel>
	);
}

/** The route owns which server is selected; the panel only draws it. */
export function McpLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/mcp/$scope/$name" });
	const selected =
		matched === false ? undefined : { scope: asScope(matched.scope), name: matched.name };
	const adding = matchRoute({ to: "/settings/mcp/$scope/new" }) !== false;
	const editing = selected !== undefined || adding;
	return (
		<MasterDetailLayout
			editing={editing}
			list={<McpPanel selected={selected} editing={editing} />}
		/>
	);
}
