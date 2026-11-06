/**
 * What the engine is doing with the composer's next message: a compaction, an
 * automatic retry, a shell command this tab sent, or prompts pi holds for the run
 * that is already going. The live work is a Task over the steps taken so far; the
 * queue is the AI Elements Queue, with its only action, Clear.
 */
import type { Queue as QueueState } from "#domain/conversation/state";
import { Queue } from "@/components/ai-elements/queue";
import type { QueueItem } from "@/components/ai-elements/queue";
import { Task } from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { LiveStep } from "./live-steps";

/** pi's own word for the working row, which an extension may replace. */
const DEFAULT_WORKING_MESSAGE = "Working";

type RunStatusProps = {
	/** A run is going and pi has not hidden its working row. */
	working: boolean;
	/** The label an extension set for that row; absent means pi's own word. */
	workingMessage: string | undefined;
	/** The steps the current run has taken so far, for the working Task. */
	steps: ReadonlyArray<LiveStep>;
	isCompacting: boolean;
	isRetrying: boolean;
	isBashRunning: boolean;
	/** The command this tab sent, when it still knows it; another tab's has no name here. */
	bashCommand: string | undefined;
	/** What that command has written so far, as pi streams it. */
	bashOutput: string;
	queue: QueueState;
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
	steps,
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

	const pending: QueueItem[] = queued.map((entry, index) => ({
		description: entry.label,
		key: `${entry.label}-${index}`,
		title: entry.text,
	}));

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 pt-3">
			{working && (
				<div className="rounded-xl border bg-background px-3 py-2">
					<Task
						title={
							workingMessage === undefined || workingMessage.trim() === ""
								? `${DEFAULT_WORKING_MESSAGE}…`
								: workingMessage
						}
						status="running"
						steps={steps}
					/>
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
				<div className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2">
					<div className="min-w-0 flex-1">
						<Terminal
							command={bashCommand ?? "shell command"}
							output={bashOutput}
							running
							failed={false}
							title={
								bashCommand === undefined
									? "Shell command running…"
									: `Shell command running: ${bashCommand}`
							}
						/>
					</div>
					<Button size="sm" variant="destructive" onClick={onAbortBash}>
						Stop
					</Button>
				</div>
			)}
			{queued.length > 0 && (
				<div className="rounded-xl border bg-background px-3 py-2">
					<Queue
						pending={pending}
						completed={[]}
						title="Queued for this run"
						action={
							<Button size="xs" variant="ghost" onClick={onClearQueue}>
								Clear
							</Button>
						}
					/>
				</div>
			)}
		</div>
	);
}
