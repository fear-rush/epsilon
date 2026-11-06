import { CheckIcon, CircleDotIcon, ListTodoIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

export type QueueItem = {
	readonly key: string;
	readonly title: string;
	readonly description?: string | undefined;
};

/**
 * What the agent holds for a run, split into what is left and what is done. Epsilon's
 * queue is steering messages and follow-ups, so the left group is what pi will read and
 * the done group is empty; the shape is kept for the day a todo list arrives.
 */
export function Queue({
	pending,
	completed,
	title,
	action,
}: {
	pending: ReadonlyArray<QueueItem>;
	completed: ReadonlyArray<QueueItem>;
	/** The whole line's label; absent means the count and "queued". */
	title?: string;
	/** An action that sits beside the line, outside its button. */
	action?: ReactNode;
}) {
	if (pending.length === 0 && completed.length === 0) return null;
	const label =
		title ?? (pending.length === 0 ? `${completed.length} completed` : `${pending.length} queued`);
	const count = title === undefined ? undefined : `${pending.length}`;

	return (
		<div className="flex min-w-0 items-start gap-2">
			<div className="min-w-0 flex-1">
				<Trace>
					<TraceCollapsible defaultOpen>
						<TraceCollapsibleTrigger>
							<TraceLine>
								<TraceIcon>
									<ListTodoIcon />
								</TraceIcon>
								<TraceTitle>{label}</TraceTitle>
								{count === undefined ? undefined : <TraceDescription>{count}</TraceDescription>}
							</TraceLine>
						</TraceCollapsibleTrigger>
						<TraceCollapsibleContent keepMounted>
							<Trace>
								{pending.map((item) => (
									<TraceLine key={item.key} status="pending">
										<TraceIcon>
											<CircleDotIcon />
										</TraceIcon>
										<TraceTitle className="line-clamp-2 whitespace-pre-wrap">
											{item.title}
										</TraceTitle>
										{item.description === undefined ? undefined : (
											<TraceDescription>{item.description}</TraceDescription>
										)}
									</TraceLine>
								))}
								{completed.map((item) => (
									<TraceLine key={item.key}>
										<TraceIcon>
											<CheckIcon />
										</TraceIcon>
										<TraceTitle className="line-clamp-2 whitespace-pre-wrap">
											{item.title}
										</TraceTitle>
										{item.description === undefined ? undefined : (
											<TraceDescription>{item.description}</TraceDescription>
										)}
									</TraceLine>
								))}
							</Trace>
						</TraceCollapsibleContent>
					</TraceCollapsible>
				</Trace>
			</div>
			{action === undefined ? undefined : (
				<div className="flex shrink-0 items-center pt-0.5">{action}</div>
			)}
		</div>
	);
}
