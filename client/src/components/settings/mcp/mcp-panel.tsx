/**
 * The left side of the MCP editor: configured servers and the add route. A server
 * appears here only when `mcp.json` has an entry for it.
 */
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/use-settings";

export function McpPanel({
	selectedName,
	editing,
}: {
	selectedName: string | undefined;
	editing: boolean;
}) {
	const settings = useSettings();
	const [query, setQuery] = useState("");

	const servers = settings.data?.mcp ?? [];
	const needle = query.trim().toLowerCase();
	const visible = servers.filter((server) =>
		[server.name, server.target, server.description ?? ""].join(" ").toLowerCase().includes(needle),
	);

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
					visible.map((server) => (
						<Link
							key={server.name}
							to="/settings/mcp/$name"
							params={{ name: server.name }}
							className={cn(
								"flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
								selectedName === server.name ? "bg-muted" : "hover:bg-muted/60",
							)}
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">{server.name}</span>
								<span className="block truncate text-xs text-muted-foreground">
									{server.target === ""
										? server.transport
										: `${server.transport} · ${server.target}`}
								</span>
							</span>
							{!server.enabled && <Badge variant="warning">Disabled</Badge>}
						</Link>
					))
				)}
			</div>
			<div className="shrink-0 border-t p-3">
				<Link
					to="/settings/mcp/new"
					className={cn(buttonVariants({ variant: "outline" }), "w-full")}
				>
					<PlusIcon />
					Add MCP
				</Link>
			</div>
		</aside>
	);
}
