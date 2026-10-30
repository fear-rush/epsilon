/**
 * One MCP server, read and written into the file its scope names. The form holds
 * a draft so nothing is written until Save; a new server becomes a real route
 * after its first save. A project entry that only overrides a global server is
 * not editable as a server: it is shown by `McpOverrideForm` instead.
 */
import { Block, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import type { McpScope, McpServerDetail, McpServerInput } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CancelDialog } from "@/components/settings/cancel-dialog";
import { DeleteDialog } from "@/components/settings/delete-dialog";
import { DiscardDialog } from "@/components/settings/discard-dialog";
import { keepUntouched } from "@/components/settings/field-errors";
import { useSettingsRefresh } from "@/components/settings/settings-refresh";
import { useSettings } from "@/hooks/use-settings";
import { deleteMcpServer, saveMcpServer, setMcpServerInProject } from "@/lib/api";

import { draftOf, inputOf } from "./mcp-draft";
import { McpFields } from "./mcp-fields";
import { McpKeptGroup, McpProjectGroup } from "./mcp-form-groups";
import { McpOverrideForm } from "./mcp-override";
import { McpTargetFields } from "./mcp-target";
import { mcpFieldErrors, mcpFields } from "./mcp-validation";
import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

const scopeLabel = (scope: McpScope): string => (scope === "global" ? "Global" : "This project");

const scopeDescription = (scope: McpScope): string =>
	scope === "global"
		? "Read from this deployment's agent home, so every session can connect it."
		: "Read from this project's .pi/mcp.json, so only sessions in this folder connect it.";

export function McpForm({
	detail,
	scope,
}: {
	detail: McpServerDetail | undefined;
	scope: McpScope;
}) {
	if (detail?.overrideKeys !== undefined) {
		return <McpOverrideForm detail={detail} />;
	}
	return <McpServerForm detail={detail} scope={scope} />;
}

function McpServerForm({
	detail,
	scope,
}: {
	detail: McpServerDetail | undefined;
	scope: McpScope;
}) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const [draft, setDraft] = useState<McpDraft>(() => draftOf(detail, scope));
	const [dirty, setDirty] = useState(false);
	const [errors, setErrors] = useState<McpFieldErrors>({});
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const allowLeave = useRef(false);

	/** Names already used in this file, so a new server cannot replace one by accident. */
	const taken = new Set(
		(settings.data?.mcp ?? [])
			.filter((server) => server.scope === scope && server.name !== detail?.name)
			.map((server) => server.name),
	);

	const update = (patch: Partial<McpDraft>) => {
		allowLeave.current = false;
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
		setErrors((current) => keepUntouched(current, mcpFields, Object.keys(patch)));
	};

	const save = useMutation({
		mutationFn: saveMcpServer,
		onSuccess: () => {
			setDirty(false);
			refresh();
			if (detail === undefined) {
				allowLeave.current = true;
				void navigate({
					to: "/settings/mcp/$scope/$name",
					params: { scope, name: draft.name.trim() },
					replace: true,
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: (target: { scope: McpScope; name: string }) =>
			deleteMcpServer(target.scope, target.name),
		onSuccess: () => {
			refresh();
			allowLeave.current = true;
			void navigate({ to: "/settings/mcp" });
		},
	});
	const inProject = useMutation({
		mutationFn: (input: { name: string; value: "inherit" | "on" | "off" }) =>
			setMcpServerInProject(input),
		onSuccess: () => refresh(),
	});

	const submit = () => {
		const found = mcpFieldErrors(draft, taken);
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		const input: McpServerInput = inputOf(draft);
		save.mutate(input);
	};
	const overrideLink =
		detail !== undefined && (detail.overriddenByProject || detail.replacedByProject) ? (
			<Link
				to="/settings/mcp/$scope/$name"
				params={{ scope: "project", name: detail.name }}
				className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
			>
				Show the project entry
			</Link>
		) : undefined;

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
							<h1 className="truncate text-2xl font-semibold tracking-tight">
								{detail?.name ?? "New MCP server"}
							</h1>
							<Badge variant="secondary">{scopeLabel(scope)}</Badge>
						</div>
						<p className="text-sm text-muted-foreground">{scopeDescription(scope)}</p>
					</header>

					{detail?.invalid !== undefined && (
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertTitle>pi skips this entry</AlertTitle>
							<AlertDescription>
								{detail.invalid} The switch in the list fixes only <code>enabled</code>; any other
								key has to be fixed in the file.
							</AlertDescription>
						</Alert>
					)}
					{detail?.replacedByProject === true && (
						<Alert>
							<AlertTitle>Replaced in this project</AlertTitle>
							<AlertDescription>
								This project&apos;s .pi/mcp.json defines its own server with this name, so sessions
								here connect that one instead. {overrideLink}
							</AlertDescription>
						</Alert>
					)}
					{detail?.overriddenByProject === true && (
						<Alert>
							<AlertTitle>Changed in this project</AlertTitle>
							<AlertDescription>
								This project&apos;s .pi/mcp.json changes this server, so sessions here use the
								project&apos;s value. {overrideLink}
							</AlertDescription>
						</Alert>
					)}

					<McpFields draft={draft} errors={errors} editing={detail !== undefined} update={update} />
					<McpTargetFields draft={draft} errors={errors} update={update} />

					{scope === "project" && (
						<Alert>
							<TriangleAlertIcon />
							<AlertTitle>This file belongs to the repository</AlertTitle>
							<AlertDescription>
								The entry is written to this project&apos;s .pi/mcp.json, which is usually
								committed. Use <code>{"${NAME}"}</code> where a secret is needed; pi reads it from
								the dashboard&apos;s environment. A value that starts with <code>!</code> runs a
								shell command on the dashboard host at every connection.
							</AlertDescription>
						</Alert>
					)}

					{detail !== undefined && detail.scope === "global" && (
						<McpProjectGroup
							detail={detail}
							projectDir={settings.data?.projectDir}
							pending={inProject.isPending}
							error={inProject.error}
							onAction={(value) => inProject.mutate({ name: detail.name, value })}
						/>
					)}

					{detail !== undefined &&
						(detail.oauthKeys.length > 0 ||
							detail.authProvider !== undefined ||
							detail.toolExposureKeys.length > 0) && <McpKeptGroup detail={detail} />}

					{save.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{save.error.message}</AlertDescription>
						</Alert>
					)}
				</div>
			</div>

			<footer className="shrink-0 border-t">
				<div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
					<span className="text-xs text-muted-foreground">
						{dirty ? "Unsaved changes" : detail === undefined ? "Not saved yet" : ""}
					</span>
					<div className="flex items-center gap-2">
						{detail === undefined ? (
							<Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
								Cancel
							</Button>
						) : (
							<Button
								type="button"
								variant="destructive"
								onClick={() => {
									remove.reset();
									setDeleteOpen(true);
								}}
							>
								Delete
							</Button>
						)}
						<Button type="button" onClick={submit} disabled={save.isPending}>
							{save.isPending && <Spinner data-icon="inline-start" />}
							Save
						</Button>
					</div>
				</div>
			</footer>

			{detail === undefined && (
				<CancelDialog
					open={cancelOpen}
					title="Cancel this MCP server?"
					description="Nothing is saved until you press Save. The name, transport and target you entered will be lost."
					onOpenChange={setCancelOpen}
					onDiscard={() => {
						allowLeave.current = true;
						void navigate({ to: "/settings/mcp" });
					}}
				/>
			)}

			<Block
				shouldBlockFn={() => dirty && !allowLeave.current}
				enableBeforeUnload={() => dirty && !allowLeave.current}
				withResolver
			>
				{({ status, proceed, reset }) =>
					status === "blocked" ? (
						<DiscardDialog subject="MCP server" onStay={reset} onDiscard={proceed} />
					) : null
				}
			</Block>

			<DeleteDialog
				open={deleteOpen}
				title={`Remove ${detail?.name ?? draft.name}?`}
				description={
					scope === "global"
						? "The entry leaves the agent home's mcp.json, so no session connects to it again. An OAuth token it stored stays in mcp-auth.json."
						: "The entry leaves this project's .pi/mcp.json. An OAuth token it stored stays in mcp-auth.json."
				}
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate({ scope: detail.scope, name: detail.name });
				}}
			/>
		</div>
	);
}
