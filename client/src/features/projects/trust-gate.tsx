/**
 * The page a project session shows until its folder is trusted. Nothing attaches
 * before this answers yes, so no engine starts and no project file loads in a
 * folder the operator has not looked at.
 */
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { useProjectStatus, useTrustProject } from "@/features/projects/queries";
import { TrustNotice } from "@/features/projects/trust-notice";

export function TrustGate({
	project,
	header,
	children,
}: {
	project: string;
	/** The page header, kept while the gate shows so the sidebar toggle stays reachable. */
	header: ReactNode;
	children: ReactNode;
}) {
	const navigate = useNavigate();
	const status = useProjectStatus(project);
	const trust = useTrustProject();

	if (status.data?.trusted === true) return children;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{header}
			{status.isPending ? (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<LoadingState label="Checking the folder…" />
				</div>
			) : status.isError ? (
				<StatusView {...errorView(status.error)} />
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center p-6 animate-enter-rise">
					<div className="grid w-full max-w-dialog-md gap-field rounded-xl border p-4">
						<div className="flex items-center gap-3">
							<FolderIcon className="size-4 shrink-0" aria-hidden />
							<div className="min-w-0">
								<p className="text-section">Trust {status.data.name}?</p>
								<p className="truncate font-mono text-meta text-muted-foreground">
									{status.data.path}
								</p>
							</div>
						</div>
						<TrustNotice status={status.data} />
						{trust.isError && <Notice tone="error">{trust.error.message}</Notice>}
						<div className="flex justify-end gap-2">
							<Button variant="destructive" onClick={() => void navigate({ to: "/", search: {} })}>
								Cancel
							</Button>
							<Button
								variant="warning"
								disabled={trust.isPending}
								onClick={() => trust.mutate(project)}
							>
								{trust.isPending && <Spinner data-icon="inline-start" />}
								Trust folder
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
