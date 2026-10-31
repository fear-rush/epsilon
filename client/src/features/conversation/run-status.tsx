/**
 * What the engine is doing with the composer's next message: a compaction, an
 * automatic retry, a shell command this tab sent, or prompts pi holds for the run
 * that is already going. pi exposes one queue with no per-item removal, so the only
 * queue action is Clear.
 */
import type { PromptQueue } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RunStatusProps = {
	isCompacting: boolean;
	isRetrying: boolean;
	isBashRunning: boolean;
	/** The command this tab sent, when it still knows it; another tab's has no name here. */
	bashCommand: string | undefined;
	queue: PromptQueue;
	onAbortCompaction: () => void;
	onCancelRetry: () => void;
	onAbortBash: () => void;
	onClearQueue: () => void;
};

export function RunStatus({
	isCompacting,
	isRetrying,
	isBashRunning,
	bashCommand,
	queue,
	onAbortCompaction,
	onCancelRetry,
	onAbortBash,
	onClearQueue,
}: RunStatusProps) {
	const queued = [
		...queue.steering.map((text) => ({ text, label: "Steering" })),
		...queue.followUp.map((text) => ({ text, label: "Follow-up" })),
	];
	if (!isCompacting && !isRetrying && !isBashRunning && queued.length === 0) return null;

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3 pt-3">
			{isCompacting && (
				<div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<Spinner />
					<span className="min-w-0 flex-1">Compacting the conversation…</span>
					<Button size="sm" variant="destructive" onClick={onAbortCompaction}>
						Stop
					</Button>
				</div>
			)}
			{isRetrying && (
				<div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<Spinner />
					<span className="min-w-0 flex-1">Retrying after a failed request…</span>
					<Button size="sm" variant="outline" onClick={onCancelRetry}>
						Cancel retry
					</Button>
				</div>
			)}
			{isBashRunning && (
				<div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<Spinner />
					<span className="min-w-0 flex-1 truncate">
						{bashCommand === undefined
							? "Shell command running…"
							: `Shell command running: ${bashCommand}`}
					</span>
					<Button size="sm" variant="destructive" onClick={onAbortBash}>
						Stop
					</Button>
				</div>
			)}
			{queued.length > 0 && (
				<div className="overflow-hidden rounded-xl border bg-background">
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<span className="min-w-0 flex-1 text-meta font-medium">Queued for this run</span>
						<Button size="xs" variant="ghost" onClick={onClearQueue}>
							Clear
						</Button>
					</div>
					<ul className="divide-y">
						{queued.map((entry, index) => (
							<li key={`${entry.label}-${index}`} className="flex items-start gap-2 px-3 py-2">
								<Badge variant="secondary" className="mt-0.5">
									{entry.label}
								</Badge>
								<span className="min-w-0 flex-1 line-clamp-2 text-meta whitespace-pre-wrap">
									{entry.text}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
