/**
 * One MCP server, read and written. The form holds a draft so nothing is written
 * until Save; a new server becomes a real route after its first save.
 */
import { Block, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import type { McpServerDetail } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CancelDialog } from "@/components/settings/cancel-dialog";
import { DeleteDialog } from "@/components/settings/delete-dialog";
import { DiscardDialog } from "@/components/settings/discard-dialog";
import { keepUntouched } from "@/components/settings/field-errors";
import { useSettingsRefresh } from "@/components/settings/settings-refresh";
import { useSettings } from "@/hooks/use-settings";
import { deleteMcpServer, saveMcpServer } from "@/lib/api";

import { draftOf, inputOf } from "./mcp-draft";
import { McpFields } from "./mcp-fields";
import { McpTargetFields } from "./mcp-target";
import { mcpFieldErrors, mcpFields } from "./mcp-validation";
import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

export function McpForm({ detail }: { detail: McpServerDetail | undefined }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const [draft, setDraft] = useState<McpDraft>(() => draftOf(detail));
	const [dirty, setDirty] = useState(false);
	const [errors, setErrors] = useState<McpFieldErrors>({});
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const allowLeave = useRef(false);

	/** Names already in use, so a new server cannot replace one by accident. */
	const taken = new Set(
		(settings.data?.mcp ?? [])
			.filter((server) => server.name !== detail?.name)
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
					to: "/settings/mcp/$name",
					params: { name: draft.name.trim() },
					replace: true,
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: deleteMcpServer,
		onSuccess: () => {
			refresh();
			allowLeave.current = true;
			void navigate({ to: "/settings/mcp" });
		},
	});

	const submit = () => {
		const found = mcpFieldErrors(draft, taken);
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(inputOf(draft));
	};

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
						<h1 className="truncate text-2xl font-semibold tracking-tight">
							{detail?.name ?? "New MCP server"}
						</h1>
					</header>

					<McpFields draft={draft} errors={errors} editing={detail !== undefined} update={update} />
					<McpTargetFields draft={draft} errors={errors} update={update} />

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
				description="The entry leaves mcp.json, so no session connects to it again. An OAuth token it stored stays in mcp-auth.json."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate(detail.name);
				}}
			/>
		</div>
	);
}
