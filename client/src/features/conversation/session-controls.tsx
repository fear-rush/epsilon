/**
 * The session's own controls. Compaction belongs to this chat; pi's two automatic
 * settings are global, so the menu says they apply to every chat instead of
 * pretending they are per-session switches. Export reads the transcript and writes
 * a copy, so a run in progress does not block it.
 */
import { FileDownIcon, FileJsonIcon, Minimize2Icon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

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
import { exportSession } from "@/api/endpoints";
import type { ExportedSession, ExportFormat } from "@/api/types";
import { CompactContextDialog } from "./compact-context-dialog";
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
}: {
	store: ConversationStore;
	/** A chat with no messages has no session file yet, so pi has nothing to export. */
	empty: boolean;
	autoCompaction: boolean;
	autoRetry: boolean;
	isCompacting: boolean;
}) {
	const [compacting, setCompacting] = useState(false);
	const [exporting, setExporting] = useState(false);

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
		</>
	);
}
