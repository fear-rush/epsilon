/**
 * What the engine is doing with the composer's next message: a compaction, an
 * automatic retry, a shell command this tab sent, or prompts pi holds for the run
 * that is already going. The live work is a Task over the steps taken so far; the
 * queue is the AI Elements Queue, with its only action, Clear.
 */
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Queue as QueueState } from "#domain/conversation/state";
import type { Notice } from "#protocol/conversation/frames";
import { Queue } from "@/components/ai-elements/queue";
import type { QueueItem } from "@/components/ai-elements/queue";
import { Task } from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { noticeView } from "@/components/patterns/status/notice-view";
import { StatusRow } from "@/components/patterns/status/status-row";
import type { Tone } from "@/components/patterns/status/status-tone";
import { Button, buttonVariants } from "@/components/ui/button";

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
	/** The engine's notices; the last three are drawn. */
	notices: ReadonlyArray<Notice>;
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
	notices,
	onReload,
	onAbortCompaction,
	onCancelRetry,
	onAbortBash,
	onClearQueue,
}: RunStatusProps) {
	const recent = notices.slice(-3);
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
		recent.length === 0 &&
		queued.length === 0
	)
		return null;

	const pending: QueueItem[] = queued.map((entry, index) => ({
		description: entry.label,
		key: `${entry.label}-${index}`,
		title: entry.text,
	}));

	return (
		<div className="mx-auto flex w-full max-w-content flex-col gap-2 px-3 pt-3">
			{working && (
				<StatusRow>
					<Task
						title={
							workingMessage === undefined || workingMessage.trim() === ""
								? `${DEFAULT_WORKING_MESSAGE}…`
								: workingMessage
						}
						status="running"
						steps={steps}
					/>
				</StatusRow>
			)}
			{recent.map((notice) => (
				<NoticeRow key={notice.id} notice={notice} />
			))}
			{drift !== undefined && (
				<StatusRow
					icon={TriangleAlertIcon}
					tone="warning"
					text="Changed in another window"
					action={
						<Button size="sm" variant="outline" onClick={onReload}>
							Reload
						</Button>
					}
				/>
			)}
			{isCompacting && (
				<StatusRow
					spinner
					text="Compacting the conversation…"
					action={
						<Button size="sm" variant="destructive" onClick={onAbortCompaction}>
							Stop
						</Button>
					}
				/>
			)}
			{isRetrying && (
				<StatusRow
					spinner
					text="Retrying after a failed request…"
					action={
						<Button size="sm" variant="outline" onClick={onCancelRetry}>
							Cancel retry
						</Button>
					}
				/>
			)}
			{isBashRunning && (
				<StatusRow
					className="items-start"
					action={
						<Button size="sm" variant="destructive" onClick={onAbortBash}>
							Stop
						</Button>
					}
				>
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
				</StatusRow>
			)}
			{queued.length > 0 && (
				<StatusRow>
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
				</StatusRow>
			)}
		</div>
	);
}

const NOTICE_ICON: Record<Tone, LucideIcon> = {
	neutral: InfoIcon,
	info: InfoIcon,
	success: CircleCheckIcon,
	warning: TriangleAlertIcon,
	danger: CircleAlertIcon,
};

/** One notice from the engine: its words are the row's text, not a title. */
function NoticeRow({ notice }: { notice: Notice }) {
	const view = noticeView(notice);
	return (
		<StatusRow
			icon={NOTICE_ICON[view.tone]}
			tone={view.tone}
			spinner={view.spinner === true}
			text={view.text}
			action={
				view.action === undefined ? undefined : (
					<Link
						to="/settings/diagnostics"
						className={buttonVariants({ size: "sm", variant: "outline" })}
					>
						Diagnostics
					</Link>
				)
			}
		/>
	);
}
