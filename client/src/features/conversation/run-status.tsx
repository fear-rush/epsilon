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

/** pi's own word for the working row, which an extension may replace. */
const DEFAULT_WORKING_MESSAGE = "Working";

type RunStatusProps = {
	/** A run is going and pi has not hidden its working row. */
	working: boolean;
	/** The label an extension set for that row; absent means pi's own word. */
	workingMessage: string | undefined;
	isCompacting: boolean;
	isRetrying: boolean;
	isBashRunning: boolean;
	/** The command this tab sent, when it still knows it; another tab's has no name here. */
	bashCommand: string | undefined;
	/** What that command has written so far, as pi streams it. */
	bashOutput: string;
	queue: PromptQueue;
	/** A message naming a change another process made to this chat's file. */
	drift: string | undefined;
	onReload: () => void;
	onAbortCompaction: () => void;
	onCancelRetry: () => void;
	onAbortBash: () => void;
	onClearQueue: () => void;
};

export function RunStatus({
	working,
	workingMessage,
	isCompacting,
	isRetrying,
	isBashRunning,
	bashCommand,
	bashOutput,
	queue,
	drift,
	onReload,
	onAbortCompaction,
	onCancelRetry,
	onAbortBash,
	onClearQueue,
}: RunStatusProps) {
	const queued = [
		...queue.steering.map((text) => ({ text, label: "Steering" })),
		...queue.followUp.map((text) => ({ text, label: "Follow-up" })),
	];
	if (
		!working &&
		!isCompacting &&
		!isRetrying &&
		!isBashRunning &&
		drift === undefined &&
		queued.length === 0
	)
		return null;

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 pt-3">
			{working && (
				<div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<Spinner />
					<span className="min-w-0 flex-1 truncate">
						{workingMessage === undefined || workingMessage.trim() === ""
							? `${DEFAULT_WORKING_MESSAGE}…`
							: workingMessage}
					</span>
				</div>
			)}
			{drift !== undefined && (
				<div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<span className="min-w-0 flex-1">{drift}</span>
					<Button size="sm" variant="outline" onClick={onReload}>
						Reload
					</Button>
				</div>
			)}
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
				<div className="flex flex-col gap-2 rounded-xl border bg-background px-3 py-2 text-meta">
					<div className="flex items-center gap-2">
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
					{bashOutput !== "" && (
						<pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 whitespace-pre-wrap">
							{bashOutput}
						</pre>
					)}
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
