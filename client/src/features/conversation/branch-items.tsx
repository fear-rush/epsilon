import { CopyIcon, GitForkIcon, ListTreeIcon } from "lucide-react";

import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/**
 * pi's three ways to branch, as a group inside the session controls. The tree
 * moves within this session file and keeps alternatives together; a fork copies
 * history before a message into a new chat; a clone copies the active branch.
 * The composer answers `/tree`, `/fork` and `/clone` with the same actions.
 */
export function BranchItems({
	blocked,
	empty,
	cloning,
	onTree,
	onFork,
	onClone,
}: {
	/** Why pi refuses a move or a copy right now; undefined when it is possible. */
	blocked: string | undefined;
	/** A chat with no messages has nothing to move or copy yet. */
	empty: boolean;
	cloning: boolean;
	onTree: () => void;
	onFork: () => void;
	onClone: () => void;
}) {
	const disabled = blocked !== undefined || empty;

	return (
		<DropdownMenuGroup>
			<DropdownMenuLabel>Branch this chat</DropdownMenuLabel>
			{(blocked !== undefined || empty) && (
				<div className="px-2 pb-1.5 text-meta text-muted-foreground">
					{blocked ?? "Send a message first."}
				</div>
			)}
			<DropdownMenuItem className="items-start" disabled={disabled} onClick={onTree}>
				<ListTreeIcon />
				<span className="flex flex-col gap-0.5">
					<span>Session tree…</span>
					<span className="text-meta text-muted-foreground">
						Move to another point, including other branches
					</span>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="items-start" disabled={disabled} onClick={onFork}>
				<GitForkIcon />
				<span className="flex flex-col gap-0.5">
					<span>Fork from a message…</span>
					<span className="text-meta text-muted-foreground">
						Start a new chat before the message you pick
					</span>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="items-start" disabled={disabled || cloning} onClick={onClone}>
				<CopyIcon />
				<span className="flex flex-col gap-0.5">
					<span>{cloning ? "Cloning…" : "Clone this chat"}</span>
					<span className="text-meta text-muted-foreground">
						Copy this chat as it stands into a new chat
					</span>
				</span>
			</DropdownMenuItem>
		</DropdownMenuGroup>
	);
}
