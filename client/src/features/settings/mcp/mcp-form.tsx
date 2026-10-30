import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import type { McpScope } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CancelDialog } from "@/features/settings/kit/dialogs";
import { DeleteDialog } from "@/features/settings/kit/dialogs";
import { FormFooter, FormPage } from "@/features/settings/kit/form-page";
import { UnsavedChangesBlock } from "@/features/settings/kit/dialogs";
import { useDraftForm } from "@/features/settings/kit/use-draft-form";
import { useSettingsRefresh } from "@/features/settings/queries";
import { useSettings } from "@/features/settings/queries";
import { deleteMcpServer, saveMcpServer, setMcpServerInProject } from "@/api/endpoints";
import { draftOf, inputOf } from "./mcp-draft";
import { McpFields } from "./mcp-fields";
import { McpDiagnosticsGroup, McpProjectGroup } from "./mcp-form-groups";
import { McpOverrideForm } from "./mcp-override";
import { isOverrideSubject } from "./mcp-detail";
import { McpTargetFields } from "./mcp-target";
import { mcpFieldErrors, mcpFields } from "./mcp-validation";
import type { McpDraft } from "./mcp-draft";
import type { McpField } from "./mcp-validation";
import type { McpServerDetail, McpServerInput } from "@/api/types";
import { DetailLoader } from "@/features/settings/kit/detail-loader";
import { useMcpServer } from "@/features/settings/queries";

/**
 * One MCP server, read and written into the file its scope names. The form holds
 * a draft so nothing is written until Save; a new server becomes a real route
 * after its first save. An override (`kind: "override"`) is not editable as a
 * server: `McpOverrideForm` shows it instead.
 */

const scopeLabel = (scope: McpScope): string => (scope === "global" ? "Global" : "This project");

function McpForm({ detail, scope }: { detail: McpServerDetail | undefined; scope: McpScope }) {
	if (isOverrideSubject(detail)) return <McpOverrideForm detail={detail} />;
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
	const form = useDraftForm<McpDraft, McpField>({
		initial: () => draftOf(detail, scope),
		fields: mcpFields,
	});
	const { draft, update, errors, setErrors } = form;
	const server = detail?.kind === "server" ? detail : undefined;
	const relation = server?.relation;
	const providers = settings.data?.providers ?? [];
	const providerIds = providers.map((provider) => provider.id);
	const live = settings.data?.mcpLive;

	/** Names already used in this file, so a new server cannot replace one by accident. */
	const taken = new Set(
		(settings.data?.mcp ?? [])
			.filter((server) => server.scope === scope && server.name !== detail?.name)
			.map((server) => server.name),
	);

	const save = useMutation({
		mutationFn: saveMcpServer,
		onSuccess: () => {
			form.markSaved();
			refresh();
			if (detail === undefined) {
				form.allowLeave();
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
			form.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/mcp" }).then(refresh);
		},
	});
	const inProject = useMutation({
		mutationFn: (input: { name: string; value: "inherit" | "on" | "off" }) =>
			setMcpServerInProject(input),
		onSuccess: () => refresh(),
	});

	const submit = () => {
		const found = mcpFieldErrors(draft, taken, new Set(providerIds));
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		const input: McpServerInput = inputOf(draft);
		save.mutate(input);
	};
	const overrideLink =
		detail !== undefined &&
		(relation === "overridden-by-project" || relation === "replaced-by-project") ? (
			<Link
				to="/settings/mcp/$scope/$name"
				params={{ scope: "project", name: detail.name }}
				className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
			>
				Show the project entry
			</Link>
		) : undefined;

	return (
		<FormPage
			backTo="/settings/mcp"
			backLabel="MCP servers"
			title={detail?.name ?? "New MCP server"}
			badge={<Badge variant="secondary">{scopeLabel(scope)}</Badge>}
			footer={
				<FormFooter
					dirty={form.dirty}
					isNew={detail === undefined}
					saving={save.isPending}
					onSave={submit}
					onCancel={() => form.setCancelOpen(true)}
					onDelete={() => {
						remove.reset();
						form.setDeleteOpen(true);
					}}
				/>
			}
		>
			{detail?.kind === "invalid" && (
				<Alert variant="destructive">
					<TriangleAlertIcon />
					<AlertTitle>pi skips this entry</AlertTitle>
					<AlertDescription>
						{detail.problem} The form is filled in from what pi could still read, and a save
						rewrites every key it edits and checks the result with pi&apos;s own rules, so fixing
						the target, exposure or timeout here repairs the entry.
					</AlertDescription>
				</Alert>
			)}
			{relation === "replaced-by-project" && (
				<Alert>
					<AlertTitle>Replaced in this project</AlertTitle>
					<AlertDescription>
						This project&apos;s .pi/mcp.json defines its own server with this name, so sessions here
						connect that one instead. {overrideLink}
					</AlertDescription>
				</Alert>
			)}
			{relation === "overridden-by-project" && (
				<Alert>
					<AlertTitle>Changed in this project</AlertTitle>
					<AlertDescription>
						This project&apos;s .pi/mcp.json changes this server, so sessions here use the
						project&apos;s value. {overrideLink}
					</AlertDescription>
				</Alert>
			)}

			<McpFields draft={draft} errors={errors} editing={detail !== undefined} update={update} />
			<McpTargetFields draft={draft} errors={errors} providerIds={providerIds} update={update} />

			{scope === "project" && (
				<Alert>
					<TriangleAlertIcon />
					<AlertTitle>This file belongs to the repository</AlertTitle>
					<AlertDescription>
						The entry is written to this project&apos;s .pi/mcp.json, which is usually committed.
						Use <code>{"${NAME}"}</code> where a secret is needed; pi reads it from the
						dashboard&apos;s environment. A value that starts with <code>!</code> runs a shell
						command on the dashboard host at every connection.
					</AlertDescription>
				</Alert>
			)}

			{server !== undefined && server.scope === "global" && (
				<McpProjectGroup
					detail={server}
					projectDir={settings.data?.projectDir}
					pending={inProject.isPending}
					error={inProject.error}
					onAction={(value) => inProject.mutate({ name: server.name, value })}
				/>
			)}

			{server !== undefined && <McpDiagnosticsGroup detail={server} live={live} />}

			{save.error !== null && (
				<Alert variant="destructive">
					<AlertDescription>{save.error.message}</AlertDescription>
				</Alert>
			)}

			{detail === undefined && (
				<CancelDialog
					open={form.cancelOpen}
					title="Cancel this MCP server?"
					description="Nothing is saved until you press Save. The name, transport and target you entered will be lost."
					onOpenChange={form.setCancelOpen}
					onDiscard={() => {
						form.allowLeave();
						void navigate({ to: "/settings/mcp" });
					}}
				/>
			)}

			<UnsavedChangesBlock blocked={form.blocked} subject="MCP server" />

			<DeleteDialog
				open={form.deleteOpen}
				title={`Remove ${detail?.name ?? draft.name}?`}
				description={
					scope === "global"
						? "The entry leaves the agent home's mcp.json, so no session connects to it again. An OAuth token it stored stays in mcp-auth.json."
						: "The entry leaves this project's .pi/mcp.json. An OAuth token it stored stays in mcp-auth.json."
				}
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate({ scope: detail.scope, name: detail.name });
				}}
			/>
		</FormPage>
	);
}

/**
 * One MCP server route: read the entry from the file its scope names, then render
 * its form. A new server skips the read and starts from an empty draft.
 */

export function McpEditor({ scope, name }: { scope: McpScope; name?: string }) {
	const query = useMcpServer(scope, name);
	return (
		<DetailLoader
			query={query}
			reading={name !== undefined}
			noun="MCP server"
			backTo="/settings/mcp"
			backLabel="MCP servers"
		>
			{(detail) => <McpForm key={`${scope}\0${detail?.name}`} detail={detail} scope={scope} />}
		</DetailLoader>
	);
}
