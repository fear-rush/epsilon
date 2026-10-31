/**
 * A project entry that only overrides a global server: it changes `enabled`,
 * `exposure` or `toolExposure` of the server of its name and keeps everything
 * else, credentials included. It has no target of its own, so this page shows
 * the switch for its state and the way back to the global setting.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EnabledSwitch } from "@/components/patterns/controls/enabled-switch";
import { DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";
import { deleteMcpServer, setMcpServerEnabled, setMcpServerInProject } from "@/api/endpoints";
import type { McpOverrideSubject } from "./mcp-detail";

export function McpOverrideForm({ detail }: { detail: McpOverrideSubject }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const project = useSettingsProject();
	const [deleteOpen, setDeleteOpen] = useState(false);
	/** An invalid override has no resolved target or state; pi skips it. */
	const problem = detail.kind === "invalid" ? detail.problem : undefined;

	const enabled = useMutation({
		mutationFn: (next: boolean) =>
			setMcpServerEnabled(project, { scope: "project", name: detail.name, enabled: next }),
		onSuccess: () => refresh(),
	});
	const inherit = useMutation({
		mutationFn: () =>
			setMcpServerInProject(project, { name: detail.name, value: "inherit" as const }),
		onSuccess: () => {
			// Leave first: a refresh while this page is mounted refetches the removed entry.
			void navigate({ to: "/settings/mcp", replace: true }).then(refresh);
		},
	});
	const remove = useMutation({
		mutationFn: () => deleteMcpServer(project, "project", detail.name),
		onSuccess: () => {
			void navigate({ to: "/settings/mcp", replace: true }).then(refresh);
		},
	});

	const busy = enabled.isPending || inherit.isPending || remove.isPending;
	const failure = enabled.error ?? inherit.error;

	return (
		<DetailPage
			title={detail.name}
			back={{ to: "/settings/mcp", label: "MCP servers" }}
			actions={
				<EnabledSwitch
					checked={detail.enabled}
					disabled={busy || problem !== undefined}
					label={detail.name}
					onCheckedChange={(next) => enabled.mutate(next)}
				/>
			}
			footer={
				<>
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
					<Button
						type="button"
						variant="outline"
						disabled={busy || problem !== undefined}
						onClick={() => inherit.mutate()}
					>
						Use global setting
					</Button>
				</>
			}
		>
			{problem !== undefined && <Notice tone="error">{problem}</Notice>}

			<Section title="Override">
				<Row title="Global server">
					<Link
						to="/settings/mcp/$scope/$name"
						params={{ scope: "global", name: detail.name }}
						search={(previous) => previous}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						Open
					</Link>
				</Row>
			</Section>

			{failure !== null && <Notice tone="error">{failure.message}</Notice>}

			<DeleteDialog
				open={deleteOpen}
				title={`Remove the override for ${detail.name}?`}
				description="Chats in this project use the global setting again."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setDeleteOpen}
				onConfirm={() => remove.mutate()}
			/>
		</DetailPage>
	);
}
