import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FolderLockIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ProjectTrustAction } from "#protocol/settings/projects";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";
import { projectStatusQuery } from "@/core/queries";
import { call } from "@/core/runtime";

/**
 * The trust gate before a chat runs in a project folder.
 *
 * pi loads a folder's own `.pi` settings, skills and extensions only once the folder is
 * trusted, and Epsilon starts no engine before that answer exists. A folder with nothing
 * gated is trusted without a prompt, so this asks only when pi would.
 */
export function ProjectGate({ folder, children }: { folder: string; children: ReactNode }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const status = useQuery(projectStatusQuery(folder));
	const trust = useMutation({
		mutationFn: (action: ProjectTrustAction) =>
			call((client) => client["settings.projects.setTrust"]({ action, path: folder })),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "projects"] }),
	});

	if (status.isPending) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<LoadingState label="Checking the folder…" />
			</div>
		);
	}

	if (status.error !== null) {
		const view = errorView(status.error);
		return (
			<StatusView
				action={
					<Button variant="outline" onClick={() => void navigate({ to: "/" })}>
						Start a chat without a folder
					</Button>
				}
				icon={view.icon}
				line={view.line}
				title={view.title}
				tone={view.tone}
			/>
		);
	}

	if (status.data.trusted) return <>{children}</>;

	return (
		<Pane className="flex-1">
			<PaneBar
				leading={<FolderLockIcon className="size-4 text-muted-foreground" />}
				title={status.data.name}
				meta="Not trusted"
			/>
			<PaneBody page>
				<div className="grid gap-2">
					<h2 className="text-section">This folder is not trusted</h2>
					<p className="text-body text-muted-foreground">
						Epsilon starts no chat in it until you decide. pi loads a folder&apos;s <code>.pi</code>{" "}
						settings, skills and extensions only once it is trusted.
					</p>
					<p className="text-meta break-all text-muted-foreground">{status.data.path}</p>
				</div>
				{status.data.hasProjectResources && (
					<Notice tone="info" title="This folder carries pi resources">
						A <code>.pi</code> folder or project skills would load here once it is trusted.
					</Notice>
				)}
				{(status.data.settingsProblems ?? []).map((problem) => (
					<Notice
						key={problem.path ?? problem.message}
						tone="warning"
						title="pi cannot read this folder's settings"
					>
						{problem.message}
					</Notice>
				))}
				{trust.error !== null && (
					<Notice tone="error" title="The folder was not trusted">
						{errorView(trust.error).line}
					</Notice>
				)}
				<div className="flex flex-wrap gap-2">
					<Button disabled={trust.isPending} onClick={() => trust.mutate("trust")}>
						{trust.isPending ? "Trusting…" : "Trust this folder"}
					</Button>
					{status.data.parent !== null && (
						<Button
							variant="outline"
							disabled={trust.isPending}
							onClick={() => trust.mutate("trust-parent")}
						>
							Trust the parent folder
						</Button>
					)}
					<Button variant="ghost" onClick={() => void navigate({ to: "/" })}>
						Not now
					</Button>
				</div>
			</PaneBody>
		</Pane>
	);
}
