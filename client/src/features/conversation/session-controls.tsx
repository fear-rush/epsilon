/**
 * The session's own controls. Compaction belongs to this chat; pi's two automatic
 * settings are global, so the menu says they apply to every chat instead of
 * pretending they are per-session switches. Export reads the transcript and writes
 * a copy, so a run in progress does not block it. A fork or a clone answers a new
 * session id, so the page moves to that chat instead of replacing this one
 * (docs/DECISIONS.md, Session copies).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	CopyIcon,
	FileDownIcon,
	FileJsonIcon,
	GitForkIcon,
	Minimize2Icon,
	SlidersHorizontalIcon,
} from "lucide-react";
import { useState } from "react";
import type { SnapshotBranch } from "shared";

import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cloneSession, exportSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import type { ExportedSession, ExportFormat } from "@/api/types";
import { CompactContextDialog } from "./compact-context-dialog";
import { ForkSessionDialog } from "./fork-dialog";
import type { ConversationStore } from "./store";

/** Hand the answer's text to the browser's own download, under the name the server chose. */
const saveAs = ({ filename, mimeType, text }: ExportedSession): void => {
	const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	// The download reads the blob after this task, so the URL has to outlive it.
	setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function SessionControls({
	store,
	empty,
	autoCompaction,
	autoRetry,
	isCompacting,
	project,
	branches,
}: {
	store: ConversationStore;
	/** A chat with no messages has no session file yet, so pi has nothing to copy. */
	empty: boolean;
	autoCompaction: boolean;
	autoRetry: boolean;
	isCompacting: boolean;
	/** The folder a project chat runs in, so a copy opens in the same place. */
	project: string | undefined;
	/** The active branch's user messages: what "fork from a message" can reach. */
	branches: SnapshotBranch[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [compacting, setCompacting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [cloning, setCloning] = useState(false);
	const [forking, setForking] = useState(false);

	/** A refusal goes where a refused command goes, because there is no dialog to hold it. */
	const exportAs = async (format: ExportFormat): Promise<void> => {
		setExporting(true);
		try {
			saveAs(await exportSession(store.sessionId, format));
		} catch (cause) {
			store.reportProblem(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setExporting(false);
		}
	};

	/** pi copies the branch up to where this chat is now, under a new id to open next. */
	const cloneChat = async (): Promise<void> => {
		setCloning(true);
		try {
			const id = await cloneSession(store.sessionId);
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
			await navigate({
				to: "/sessions/$sessionId",
				params: { sessionId: id },
				search: { project },
			});
		} catch (cause) {
			store.reportProblem(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setCloning(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<Tip label="Session controls">
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Session controls"
								className="text-muted-foreground"
							/>
						}
					>
						<SlidersHorizontalIcon />
					</DropdownMenuTrigger>
				</Tip>
				<DropdownMenuContent align="end" className="w-72">
					<DropdownMenuGroup>
						<DropdownMenuLabel>This chat</DropdownMenuLabel>
						<DropdownMenuItem disabled={isCompacting} onClick={() => setCompacting(true)}>
							<Minimize2Icon />
							Compact context…
						</DropdownMenuItem>
						<DropdownMenuItem disabled={empty || exporting} onClick={() => void exportAs("html")}>
							<FileDownIcon />
							Export as HTML
						</DropdownMenuItem>
						<DropdownMenuItem disabled={empty || exporting} onClick={() => void exportAs("jsonl")}>
							<FileJsonIcon />
							Export as JSONL
						</DropdownMenuItem>
						<DropdownMenuItem disabled={empty || cloning} onClick={() => void cloneChat()}>
							<CopyIcon />
							Clone this chat
						</DropdownMenuItem>
						<DropdownMenuItem disabled={empty} onClick={() => setForking(true)}>
							<GitForkIcon />
							Fork from a message…
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Every chat</DropdownMenuLabel>
						<DropdownMenuCheckboxItem
							checked={autoCompaction}
							onCheckedChange={(checked) => store.setAutoCompaction(checked === true)}
							className="items-start"
						>
							<span className="flex flex-col gap-0.5">
								<span>Auto-compact context</span>
								<span className="text-meta text-muted-foreground">
									pi's global setting: applies to every chat
								</span>
							</span>
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={autoRetry}
							onCheckedChange={(checked) => store.setAutoRetry(checked === true)}
							className="items-start"
						>
							<span className="flex flex-col gap-0.5">
								<span>Auto-retry failed turns</span>
								<span className="text-meta text-muted-foreground">
									pi's global setting: applies to every chat
								</span>
							</span>
						</DropdownMenuCheckboxItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<CompactContextDialog
				open={compacting}
				onOpenChange={setCompacting}
				onCompact={(instructions) => store.compact(instructions)}
			/>
			<ForkSessionDialog
				open={forking}
				onOpenChange={setForking}
				sessionId={store.sessionId}
				project={project}
				branches={branches}
			/>
		</>
	);
}
