import { ChevronDownIcon, CornerUpLeftIcon } from "lucide-react";
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
import { BranchRow } from "../branch-row";

type BranchMenuProps = {
	/** The active branch's user messages, root to leaf, with their whole text. */
	branches: SnapshotBranch[];
	/** Why going back is refused right now; undefined when it is possible. */
	blocked: string | undefined;
	/** `summarize` asks pi to condense the branch that is being left behind. */
	onGoBack: (branch: SnapshotBranch, summarize: boolean) => void;
};

/**
 * Go back to an earlier message of this branch. The list is the messages pi holds
 * for the branch the transcript shows, numbered in the order they were sent.
 * Picking one moves the leaf to just before it and fills the composer with its
 * text, so sending it starts a new branch beside the old one; branches other than
 * the active one are not listed (docs/DECISIONS.md, Branching).
 */
export function BranchMenu({ branches, blocked, onGoBack }: BranchMenuProps) {
	const [summarize, setSummarize] = useState(false);
	if (branches.length === 0) return null;

	return (
		<DropdownMenu>
			<Tip label={blocked ?? "Go back"}>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							className="shrink-0 text-meta"
							disabled={blocked !== undefined}
						/>
					}
				>
					<CornerUpLeftIcon data-icon="inline-start" />
					Go back
					<ChevronDownIcon data-icon="inline-end" />
				</DropdownMenuTrigger>
			</Tip>
			<DropdownMenuContent side="top" align="end" className="max-h-96 w-96">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Go back to a message</DropdownMenuLabel>
				</DropdownMenuGroup>
				<div className="px-2 pb-1.5 text-meta text-muted-foreground">
					Picking one puts its text back in the box. Sending it starts a new branch from there.
				</div>
				{branches.map((branch, index) => (
					<DropdownMenuItem
						key={branch.entryId}
						className="items-baseline"
						onClick={() => onGoBack(branch, summarize)}
					>
						<BranchRow branch={branch} index={index} multiline />
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={summarize}
					onCheckedChange={(checked) => setSummarize(checked === true)}
				>
					<span aria-hidden className="w-6 shrink-0" />
					<span className="min-w-0 flex-1">Summarise the branch I leave</span>
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
