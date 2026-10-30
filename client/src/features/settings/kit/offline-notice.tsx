/**
 * The one sentence a page shows when the deployment cannot be reached. No icon,
 * no retry button and no duplicate pane: the query reconnects on its own.
 */
export function OfflineNotice({ message }: { message: string }) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<p className="max-w-sm text-center text-sm text-muted-foreground">{message}</p>
		</div>
	);
}
