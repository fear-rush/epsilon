/**
 * A chat whose recorded folder is gone. pi opens the same file with a working folder
 * for this run; the header keeps the old one, so nothing is moved. The page offers
 * the chats folder or another project's folder, and the next open asks again.
 */
import { useNavigate } from "@tanstack/react-router";
import { FolderXIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionSummary } from "@/api/types";
import { FolderDialog } from "./folder-dialog";
import { useRecentProjects } from "./queries";

export function ContinueSession({ session }: { session: SessionSummary }) {
	const navigate = useNavigate();
	const [picking, setPicking] = useState(false);
	const recent = useRecentProjects().filter((project) => project.path !== session.cwd);

	const continueIn = (project?: string): Promise<void> =>
		navigate({
			to: "/sessions/$sessionId",
			params: { sessionId: session.id },
			search: project === undefined ? { continued: "1" } : { project, continued: "1" },
		});

	return (
		<div className="flex min-h-0 flex-1 items-center justify-center p-6 animate-enter-rise">
			<div className="grid w-full max-w-dialog-md gap-field rounded-xl border p-4">
				<div className="flex items-center gap-3">
					<FolderXIcon className="size-4 shrink-0" aria-hidden />
					<div className="min-w-0">
						<p className="text-section">This chat's folder is gone</p>
						<p className="truncate font-mono text-meta text-muted-foreground">{session.cwd}</p>
					</div>
				</div>
				<p className="text-body text-muted-foreground">
					Its history is still in the same file. Choose where it should run this time; nothing is
					moved.
				</p>
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="outline" onClick={() => setPicking(true)}>
						Choose a project
					</Button>
					<Button onClick={() => void continueIn()}>Continue in the chats folder</Button>
				</div>
			</div>
			<FolderDialog
				open={picking}
				onOpenChange={setPicking}
				title="Continue this chat in a project"
				description="Its history stays in the same file; only the folder it runs in changes for this open."
				action="Continue"
				recent={recent}
				onPick={async (path) => {
					await continueIn(path);
				}}
			/>
		</div>
	);
}
