import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CodeIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

import type { McpScope, McpServerDetail, McpServerInput } from "#protocol/settings/mcp";
import {
	CancelDialog,
	DeleteDialog,
	UnsavedChangesBlock,
} from "@/components/patterns/confirm-dialogs";
import { EnabledSwitch } from "@/components/patterns/enabled-switch";
import { ModeTabs } from "@/components/patterns/mode-tabs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { useDraftForm } from "@/components/patterns/use-draft-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { settingsKeys } from "@/features/settings/keys";
import {
	useMcpServer,
	useSettings,
	useSettingsProject,
	useSettingsRefresh,
} from "@/features/settings/queries";

import { deleteMcpServer, saveMcpServer, setMcpServerEnabled } from "./commands.ts";
import { McpAdvanced } from "./mcp-advanced";
import { McpConnection } from "./mcp-connection";
import { isOverrideSubject } from "./mcp-detail";
import { draftOf, inputOf } from "./mcp-draft";
import type { McpDraft } from "./mcp-draft";
import { McpOverrideForm } from "./mcp-override";
import { McpRawPane } from "./mcp-raw";
import { useMcpRawDraft } from "./mcp-raw-draft";
import { McpServerCard } from "./mcp-server-card";
import { McpSignIn } from "./mcp-signin";
import { McpTools } from "./mcp-tools";
import { mcpFieldErrors, mcpFields } from "./mcp-validation";
import type { McpField } from "./mcp-validation";

/**
 * One MCP server, read from the file its scope names. Editing happens in a draft
 * that nothing writes until Save; only the on/off switch writes at once, as it
 * always did. An override (`kind: "override"`) is not editable as a server:
 * `McpOverrideForm` shows it instead.
 */

type McpTab = "form" | "raw";

const MODES = [
	{ value: "form", label: "Form", icon: FileTextIcon },
	{ value: "raw", label: "Raw", icon: CodeIcon },
] as const;

function McpForm({
	detail,
	scope,
	tab,
	onTab,
	onReset,
}: {
	detail: McpServerDetail;
	scope: McpScope;
	tab: McpTab;
	onTab: (tab: McpTab) => void;
	/** Drop the draft and read the server again. */
	onReset: () => void;
}) {
	if (isOverrideSubject(detail)) return <McpOverrideForm detail={detail} />;
	return <McpServerForm detail={detail} scope={scope} tab={tab} onTab={onTab} onReset={onReset} />;
}

function McpServerForm({
	detail,
	scope,
	tab,
	onTab,
	onReset,
}: {
	detail: Exclude<McpServerDetail, { kind: "override" }>;
	scope: McpScope;
	tab: McpTab;
	onTab: (tab: McpTab) => void;
	onReset: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const project = useSettingsProject();
	const form = useDraftForm<McpDraft, McpField>({
		initial: () => draftOf(detail, scope),
		fields: mcpFields,
	});
	const { draft, update, errors, setErrors } = form;
	const raw = useMcpRawDraft(scope, detail.name);
	const [pendingTab, setPendingTab] = useState<McpTab>();
	const server = detail.kind === "server" ? detail : undefined;
	const providerIds = (settings.data?.providers.providers ?? []).map((provider) => provider.id);
	const live = settings.data?.mcpLive;

	const save = useMutation({
		mutationFn: (input: McpServerInput) => saveMcpServer(project, input),
		onSuccess: async () => {
			form.markSaved();
			refresh();
			// Read the saved server before the draft starts over, so stored rows are current.
			await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
			onReset();
		},
	});
	const enable = useMutation({
		mutationFn: (enabled: boolean) =>
			setMcpServerEnabled(project, { scope: detail.scope, name: detail.name, enabled }),
		onSuccess: () => refresh(),
	});
	const remove = useMutation({
		mutationFn: () => deleteMcpServer(project, detail.scope, detail.name),
		onSuccess: () => {
			form.allowLeave();
			raw.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/mcp" }).then(refresh);
		},
	});

	const submit = () => {
		const found = mcpFieldErrors(draft, new Set(), new Set(providerIds));
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(inputOf(draft));
	};

	const failure = save.error ?? enable.error;
	const onRaw = tab === "raw";
	const leavingDirty = onRaw ? raw.dirty : form.dirty;

	const switchTo = (next: McpTab) => {
		if (next === tab) return;
		if (leavingDirty) setPendingTab(next);
		else onTab(next);
	};
	const discardAndSwitch = () => {
		if (pendingTab === undefined) return;
		if (onRaw) raw.discard();
		else {
			form.allowLeave();
			onReset();
		}
		onTab(pendingTab);
		setPendingTab(undefined);
	};

	const dirty = onRaw ? raw.dirty : form.dirty;
	const saving = onRaw ? raw.save.isPending : save.isPending;
	const failed = onRaw ? raw.save.error : failure;

	return (
		<DetailPage
			title={detail.name}
			back={{ to: "/settings/mcp", label: "MCP servers" }}
			fill={onRaw}
			bodyKey={tab}
			actions={
				<>
					{enable.isPending && <Spinner />}
					<EnabledSwitch
						checked={detail.enabled}
						disabled={enable.isPending}
						label={detail.name}
						onCheckedChange={(enabled) => enable.mutate(enabled)}
					/>
				</>
			}
			tabs={<ModeTabs items={MODES} value={tab} onValueChange={switchTo} />}
			footerStatus={dirty ? "Unsaved changes" : undefined}
			footer={
				<>
					<Button
						type="button"
						variant="destructive"
						onClick={() => {
							remove.reset();
							form.setDeleteOpen(true);
						}}
					>
						Delete
					</Button>
					{onRaw && raw.dirty && (
						<Button type="button" variant="destructive" onClick={raw.discard}>
							Discard
						</Button>
					)}
					<Button type="button" disabled={saving} onClick={onRaw ? raw.submit : submit}>
						{saving && <Spinner data-icon="inline-start" />}
						Save
					</Button>
				</>
			}
		>
			{detail.kind === "invalid" && <Notice tone="danger">{detail.problem}</Notice>}

			{onRaw ? (
				<McpRawPane raw={raw} />
			) : (
				<>
					<McpServerCard draft={draft} update={update} />
					<McpConnection draft={draft} errors={errors} update={update} />
					<McpTools
						draft={draft}
						enabled={server?.enabled ?? true}
						live={live}
						saved={!form.dirty}
						update={update}
					/>
					{server === undefined ? undefined : (
						<McpSignIn
							detail={server}
							enabled={server.enabled}
							live={live?.servers.some((entry) => entry.name === server.name) === true}
						/>
					)}
					<McpAdvanced
						draft={draft}
						errors={errors}
						providerIds={providerIds}
						detail={server}
						update={update}
					/>
				</>
			)}

			{failed !== null && <Notice error={failed} title="Couldn't save the MCP server" />}

			<UnsavedChangesBlock blocked={() => form.blocked() || raw.blocked()} subject="MCP server" />

			<CancelDialog
				open={pendingTab !== undefined}
				title="Discard unsaved changes?"
				description="Your edits on this tab will be lost."
				onOpenChange={(open) => {
					if (!open) setPendingTab(undefined);
				}}
				onDiscard={discardAndSwitch}
			/>

			<DeleteDialog
				open={form.deleteOpen}
				title={`Remove ${detail.name}?`}
				description={
					scope === "global"
						? "The entry leaves the agent home's mcp.json, so no session connects to it again. An OAuth token it stored stays in mcp-auth.json."
						: "The entry leaves this project's .pi/mcp.json. An OAuth token it stored stays in mcp-auth.json."
				}
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => remove.mutate()}
			/>
		</DetailPage>
	);
}

const BACK = { to: "/settings/mcp", label: "MCP servers" } as const;

/** One MCP server route: read the entry from the file its scope names, then render its page. */
export function McpEditor({ scope, name }: { scope: McpScope; name: string }) {
	const query = useMcpServer(scope, name);
	const [epoch, setEpoch] = useState(0);
	const [tab, setTab] = useState<McpTab>("form");
	if (query.isPending) {
		return (
			<DetailPage title={name} back={BACK}>
				<LoadingState label="Reading the MCP server…" />
			</DetailPage>
		);
	}
	if (query.error !== null) {
		return (
			<DetailPage title={name} back={BACK}>
				<StatusView {...errorView(query.error)} />
			</DetailPage>
		);
	}
	const detail = query.data;
	return (
		<McpForm
			key={`${scope}\0${detail.name}\0${epoch}`}
			detail={detail}
			scope={scope}
			tab={tab}
			onTab={setTab}
			onReset={() => setEpoch((current) => current + 1)}
		/>
	);
}
