import { ChevronDownIcon, CornerUpLeftIcon } from "lucide-react";
import type { SnapshotBranch } from "shared";

import { Tip } from "@/components/patterns/tip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";

/** The first line of a message, so every row in the list stays one line tall. */
const firstLine = (text: string): string => text.trimStart().split("\n")[0] ?? "";

type BranchMenuProps = {
	/** The active branch's user messages, root to leaf, with their whole text. */
	branches: SnapshotBranch[];
	/** Why going back is refused right now; undefined when it is possible. */
	blocked: string | undefined;
	onGoBack: (branch: SnapshotBranch) => void;
};

/**
 * Go back to an earlier message of this branch. The list is the messages pi holds
 * for the branch the transcript shows, numbered in the order they were sent.
 * Picking one moves the leaf to just before it and fills the composer with its
 * text, so sending it starts a new branch beside the old one; branches other than
 * the active one are not listed (docs/DECISIONS.md, Branching).
 */
export function BranchMenu({ branches, blocked, onGoBack }: BranchMenuProps) {
	if (branches.length === 0) return null;

	return (
		<DropdownMenu>
			<Tip
				label={
					blocked ??
					"Go back to a message: its text returns to the box, and sending it starts a new branch"
				}
			>
				<DropdownMenuTrigger
					render={
						<InputGroupButton
							size="sm"
							className="rounded-md text-meta"
							disabled={blocked !== undefined}
						/>
					}
				>
					<CornerUpLeftIcon data-icon="inline-start" />
					Go back
					<ChevronDownIcon data-icon="inline-end" />
				</DropdownMenuTrigger>
			</Tip>
			<DropdownMenuContent align="start" className="max-h-64 w-72">
				<DropdownMenuLabel>Go back to a message</DropdownMenuLabel>
				<div className="px-2 pb-1.5 text-meta text-muted-foreground">
					Picking one puts its text back in the box. Sending it starts a new branch from there.
				</div>
				{branches.map((branch, index) => (
					<DropdownMenuItem key={branch.entryId} onClick={() => onGoBack(branch)}>
						<span className="w-6 shrink-0 text-right text-meta text-muted-foreground tabular-nums">
							{index + 1}
						</span>
						<span className="min-w-0 flex-1 truncate">{firstLine(branch.text)}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
