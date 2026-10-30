/**
 * The left side of the MCP editor: this project's servers, the global servers,
 * and the add route. A server appears under the file it lives in; the same name
 * can appear twice, once per file, and the project entry wins where it does.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import type { McpScope, McpServerView } from "shared";

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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsRefresh } from "@/components/settings/settings-refresh";
import { setMcpServerEnabled } from "@/lib/api";

const badgeFor = (
	server: McpServerView,
): { label: string; variant: "warning" | "outline" | "secondary" } | undefined => {
	if (server.invalid !== undefined) return { label: "Invalid", variant: "warning" };
	if (server.overrideKeys !== undefined) return { label: "Override", variant: "outline" };
	if (server.overriddenByProject === true) return { label: "Changed here", variant: "outline" };
	if (server.replacedByProject === true) return { label: "Replaced", variant: "outline" };
	if (!server.enabled) return { label: "Off", variant: "secondary" };
	return undefined;
};

const targetLine = (server: McpServerView): string => {
	const transport = server.transport ?? "unread";
	if (server.target === "") return transport;
	return `${transport} · ${server.target}`;
};

function ServerRow({
	server,
	selected,
	onToggle,
	toggling,
}: {
	server: McpServerView;
	selected: boolean;
	onToggle: (server: McpServerView, enabled: boolean) => void;
	toggling: boolean;
}) {
	const badge = badgeFor(server);
	return (
		<div
			className={cn(
				"flex items-center gap-1 rounded-xl pr-1 transition-colors",
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
				<span className="block truncate text-xs text-muted-foreground">{targetLine(server)}</span>
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
	onToggle,
	toggling,
}: {
	title: string;
	description?: string;
	servers: McpServerView[];
	selected: { scope: McpScope; name: string } | undefined;
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
						onToggle={onToggle}
						toggling={toggling}
					/>
				))
			)}
		</div>
	);
}

export function McpPanel({
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
		[server.name, server.target, server.description ?? ""].join(" ").toLowerCase().includes(needle),
	);
	const project = visible.filter((server) => server.scope === "project");
	const global = visible.filter((server) => server.scope === "global");

	const toggle = useMutation({
		mutationFn: (input: { scope: McpScope; name: string; enabled: boolean }) =>
			setMcpServerEnabled(input),
		onSuccess: () => refresh(),
	});

	return (
		<aside
			className={cn(
				"w-full shrink-0 flex-col border-r bg-background md:flex md:w-80",
				editing ? "hidden md:flex" : "flex",
			)}
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
				<span className="text-sm font-medium">MCP servers</span>
				<span className="text-xs text-muted-foreground">{servers.length}</span>
			</div>
			{settings.data?.error !== undefined && (
				<div className="shrink-0 px-3 py-2">
					<Alert variant="destructive">
						<TriangleAlertIcon />
						<AlertDescription className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
							{settings.data.error}
						</AlertDescription>
					</Alert>
				</div>
			)}
			{settings.data?.mcpDisabled === true && (
				<div className="shrink-0 px-3 py-2">
					<Alert>
						<TriangleAlertIcon />
						<AlertDescription className="text-xs">
							MCP is turned off in this deployment&apos;s settings.json with{" "}
							<code>-builtin:mcp</code>, so no session connects these servers. Changes here are
							still saved.
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
			<div className="shrink-0 p-3">
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						placeholder="Search MCP servers"
						aria-label="Search MCP servers"
						className="pl-8"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
				{settings.isPending ? (
					<div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
						<Spinner />
						Reading MCP servers…
					</div>
				) : visible.length === 0 ? (
					<p className="px-2 py-3 text-xs text-muted-foreground">
						{servers.length === 0 ? "No MCP server configured yet." : "Nothing matches."}
					</p>
				) : (
					<>
						<ServerGroup
							title="This project"
							description={projectDir}
							servers={project}
							selected={selected}
							onToggle={(server, enabled) =>
								toggle.mutate({ scope: server.scope, name: server.name, enabled })
							}
							toggling={toggle.isPending}
						/>
						<ServerGroup
							title="Global"
							servers={global}
							selected={selected}
							onToggle={(server, enabled) =>
								toggle.mutate({ scope: server.scope, name: server.name, enabled })
							}
							toggling={toggle.isPending}
						/>
					</>
				)}
			</div>
			<div className="shrink-0 border-t p-3">
				<DropdownMenu>
					<DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
						<PlusIcon />
						Add MCP server
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-64">
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
		</aside>
	);
}
