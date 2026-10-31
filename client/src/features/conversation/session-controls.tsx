/**
 * The session's own controls. Compaction belongs to this chat; pi's two automatic
 * settings are global, so the menu says they apply to every chat instead of
 * pretending they are per-session switches.
 */
import { Minimize2Icon, SlidersHorizontalIcon } from "lucide-react";
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
import { CompactContextDialog } from "./compact-context-dialog";
import type { ConversationStore } from "./store";

export function SessionControls({
	store,
	autoCompaction,
	autoRetry,
	isCompacting,
}: {
	store: ConversationStore;
	autoCompaction: boolean;
	autoRetry: boolean;
	isCompacting: boolean;
}) {
	const [compacting, setCompacting] = useState(false);

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
