/**
 * A project entry that only overrides a global server: it changes `enabled`,
 * `exposure` or `toolExposure` of the server of its name and keeps everything
 * else, credentials included. It has no target of its own, so this pane shows the
 * server it changes instead of a form, and offers the two writes that belong to
 * it: its state in this project, and going back to the global setting.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DeleteDialog } from "@/features/settings/kit/dialogs";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";
import { useSettingsRefresh } from "@/features/settings/queries";
import { deleteMcpServer, setMcpServerEnabled, setMcpServerInProject } from "@/api/endpoints";
import type { McpOverrideSubject } from "./mcp-detail";

const keyText = (keys: readonly string[]): string =>
	keys.length === 0 ? "nothing" : keys.join(", ");

export function McpOverrideForm({ detail }: { detail: McpOverrideSubject }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const keys = detail.overrideKeys ?? [];
	/** An invalid override has no resolved target or state; pi skips it. */
	const problem = detail.kind === "invalid" ? detail.problem : undefined;
	const target = detail.kind === "override" ? detail.target : "";

	const enabled = useMutation({
		mutationFn: (next: boolean) =>
			setMcpServerEnabled({ scope: "project", name: detail.name, enabled: next }),
		onSuccess: () => refresh(),
	});
	const inherit = useMutation({
		mutationFn: () => setMcpServerInProject({ name: detail.name, value: "inherit" as const }),
		onSuccess: () => {
			// Leave first: a refresh while this page is mounted refetches the removed entry.
			void navigate({ to: "/settings/mcp", replace: true }).then(refresh);
		},
	});
	const remove = useMutation({
		mutationFn: () => deleteMcpServer("project", detail.name),
		onSuccess: () => {
			// Leave first: a refresh while this page is mounted refetches the removed entry.
			void navigate({ to: "/settings/mcp", replace: true }).then(refresh);
		},
	});

	const busy = enabled.isPending || inherit.isPending || remove.isPending;
	const failure = enabled.error ?? inherit.error ?? remove.error;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8 sm:px-8">
					<header className="grid gap-2">
						<Link
							to="/settings/mcp"
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"-ml-2 self-start md:hidden",
							)}
						>
							<ArrowLeftIcon />
							MCP servers
						</Link>
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="truncate text-2xl font-semibold tracking-tight">{detail.name}</h1>
							<Badge variant="secondary">This project</Badge>
							<Badge variant="outline">Override</Badge>
						</div>
						<p className="text-sm text-muted-foreground">
							This entry only changes {keyText(keys)} of the global server of the same name. Its
							command, URL, credentials and <code>auth</code> stay in the global file.
						</p>
					</header>

					{problem !== undefined && (
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertTitle>pi skips this override</AlertTitle>
							<AlertDescription>{problem}</AlertDescription>
						</Alert>
					)}

					<SettingsGroup title="This project">
						<SettingsBlock>
							<dl className="grid gap-2 text-sm">
								<div className="flex flex-wrap gap-2">
									<dt className="text-muted-foreground">State here</dt>
									<dd>{problem !== undefined ? "Unknown" : detail.enabled ? "On" : "Off"}</dd>
								</div>
								<div className="flex flex-wrap gap-2">
									<dt className="text-muted-foreground">Changes</dt>
									<dd>{keyText(keys)}</dd>
								</div>
								{target !== "" && (
									<div className="flex flex-wrap gap-2">
										<dt className="text-muted-foreground">Global target</dt>
										<dd className="break-all">{target}</dd>
									</div>
								)}
							</dl>
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={busy || problem !== undefined}
									onClick={() => enabled.mutate(!detail.enabled)}
								>
									{enabled.isPending && <Spinner data-icon="inline-start" />}
									{detail.enabled ? "Turn off in this project" : "Turn on in this project"}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={busy || problem !== undefined}
									onClick={() => inherit.mutate()}
								>
									{inherit.isPending && <Spinner data-icon="inline-start" />}
									Use the global setting
								</Button>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={busy}
									onClick={() => {
										remove.reset();
										setDeleteOpen(true);
									}}
								>
									Remove override
								</Button>
							</div>
							<p className="mt-3 text-xs text-muted-foreground">
								Changing the exposure of the global server changes it everywhere. This project can
								give it its own exposure by adding an <code>exposure</code> key here.
							</p>
							{failure !== null && (
								<Alert variant="destructive" className="mt-3">
									<AlertDescription>{failure.message}</AlertDescription>
								</Alert>
							)}
						</SettingsBlock>
					</SettingsGroup>

					<SettingsGroup title="Global server">
						<SettingsBlock>
							<p className="text-sm text-muted-foreground">
								The server this entry changes, with its target and stored values, is on its own
								page.
							</p>
							<Link
								to="/settings/mcp/$scope/$name"
								params={{ scope: "global", name: detail.name }}
								className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
							>
								Show the global server
							</Link>
						</SettingsBlock>
					</SettingsGroup>
				</div>
			</div>

			<DeleteDialog
				open={deleteOpen}
				title={`Remove the override for ${detail.name}?`}
				description="The project file stops changing this server, so sessions in this project use the global setting again. The global server itself is untouched."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setDeleteOpen}
				onConfirm={() => remove.mutate()}
			/>
		</div>
	);
}
