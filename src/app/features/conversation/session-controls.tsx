/**
 * The session's own controls. Compaction belongs to this chat; pi's two automatic
 * settings are global, so the menu says they apply to every chat instead of
 * pretending they are per-session switches. Export reads the transcript and writes
 * a copy, so a run in progress does not block it. The Branch group is pi's three
 * ways to move or copy the chat; the composer answers the same commands from `/`.
 */
import { FileDownIcon, FileJsonIcon, Minimize2Icon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

import type { ExportFormat } from "#protocol/conversation/export";
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

import { BranchItems } from "./branch-items.tsx";
import { CompactContextDialog } from "./compact-context-dialog.tsx";
import { downloadExport } from "./export-file.ts";
import type { Conversation } from "./use-conversation.ts";

export function SessionControls({
	conversation,
	empty,
	autoCompaction,
	autoRetry,
	hideThinkingBlock,
	isCompacting,
	blocked,
	cloning,
	onTree,
	onFork,
	onClone,
}: {
	conversation: Conversation;
	/** A chat with no file has nothing to export, fork or clone yet. */
	empty: boolean;
	autoCompaction: boolean;
	autoRetry: boolean;
	/** pi hides thinking when this is on; the transcript follows its setting. */
	hideThinkingBlock: boolean;
	isCompacting: boolean;
	/** Why branch actions are refused right now; undefined when they are possible. */
	blocked: string | undefined;
	cloning: boolean;
	onTree: () => void;
	onFork: () => void;
	onClone: () => void;
}) {
	const [compacting, setCompacting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const { report } = conversation;

	/** A refusal goes where a refused command goes, because there is no dialog to hold it. */
	const exportAs = async (format: ExportFormat): Promise<void> => {
		setExporting(true);
		try {
			downloadExport(await conversation.exportSession(format));
		} catch (cause) {
			report(cause);
		} finally {
			setExporting(false);
		}
	};

	const write = (action: Promise<void>): void => {
		void (async () => {
			try {
				await action;
			} catch (cause) {
				report(cause);
			}
		})();
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
				<DropdownMenuContent align="end" className="w-80">
					<BranchItems
						blocked={blocked}
						empty={empty}
						cloning={cloning}
						onTree={onTree}
						onFork={onFork}
						onClone={onClone}
					/>
					<DropdownMenuSeparator />
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
							onCheckedChange={(checked) => write(conversation.setAutoCompaction(checked))}
							className="items-start"
						>
							<span className="flex flex-col gap-0.5">
								<span>Auto-compact context</span>
								<span className="text-meta text-muted-foreground">
									pi&apos;s global setting: applies to every chat
								</span>
							</span>
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={autoRetry}
							onCheckedChange={(checked) => write(conversation.setAutoRetry(checked))}
							className="items-start"
						>
							<span className="flex flex-col gap-0.5">
								<span>Auto-retry failed turns</span>
								<span className="text-meta text-muted-foreground">
									pi&apos;s global setting: applies to every chat
								</span>
							</span>
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={hideThinkingBlock}
							onCheckedChange={(checked) => write(conversation.setHideThinking(checked))}
							className="items-start"
						>
							<span className="flex flex-col gap-0.5">
								<span>Hide thinking blocks</span>
								<span className="text-meta text-muted-foreground">
									pi&apos;s global setting: applies to every chat
								</span>
							</span>
						</DropdownMenuCheckboxItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<CompactContextDialog
				open={compacting}
				onOpenChange={setCompacting}
				onCompact={(instructions) => {
					write(conversation.compact(instructions));
				}}
			/>
		</>
	);
}
