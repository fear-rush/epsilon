/**
 * The session's title, where it runs, and what can be done with it from here.
 *
 * Only the place part is ported so far: `ComposerPlace` and `PlaceBadge` tell a project
 * chat which folder it works in. Moving a chat into a project is a session operation
 * with its own server call and folder picker (ledger, S3), so the menu that would offer
 * it, and `SessionHeader` itself, wait for that.
 */
import { FolderIcon } from "lucide-react";

import { LoadingState } from "@/components/patterns/status/loading-state";
import { Badge } from "@/components/ui/badge";

const folderName = (path: string): string =>
	path.split("/").findLast((part) => part !== "") ?? path;

/**
 * Where the conversation runs, above the composer. A chat needs no line: its folder is
 * Epsilon's own and says nothing. A project names the folder it works in.
 */
export function ComposerPlace({ path }: { path: string }) {
	return (
		<div className="flex min-w-0 items-center gap-2 px-2 text-meta text-muted-foreground">
			<FolderIcon className="size-4 shrink-0" />
			<span className="truncate font-medium text-foreground">{folderName(path)}</span>
			<span className="truncate">{path}</span>
		</div>
	);
}

/** The same folder in the chat's bar, short enough for a phone. */
export function PlaceBadge({ path }: { path: string }) {
	return (
		<Badge variant="secondary">
			<FolderIcon data-icon="inline-start" />
			{folderName(path)}
		</Badge>
	);
}

/**
 * What a session shows before its snapshot: the engine starting. An engine that did not
 * start is the status line's (a chat's own trouble is reported there), so the pane only
 * waits. The home page uses this too, so a new chat cannot spin in silence.
 */
export function SessionLoader() {
	return (
		<div className="flex min-h-0 flex-1 animate-enter-rise items-center justify-center">
			<LoadingState label="Loading the session…" />
		</div>
	);
}
