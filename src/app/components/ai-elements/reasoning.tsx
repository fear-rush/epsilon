import { useState } from "react";

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

import { StepStatusIcon } from "./status-icon";

/** A duration as the line under a finished thought reads it: 1_240 reads as 1.2s. */
const secondsLabel = (durationMs: number): string => `${(durationMs / 1000).toFixed(1)}s`;

/**
 * The agent's thinking as one line. It reads "Thinking" and opens while the model
 * thinks, then reads "Thought", quotes the first line of it, and closes. When pi hides
 * thinking, the line keeps pi's label and no text: the reader still sees that a thought
 * happened.
 *
 * One line for every thought in the transcript: a step's thinking inside a run, an
 * answer's thinking above its prose, and the streaming one while it is being written.
 */
export function Reasoning({
	text,
	running,
	hidden = false,
	label,
	durationMs,
}: {
	text: string;
	running: boolean;
	/** pi hides the thinking itself and leaves a label where it was. */
	hidden?: boolean;
	/** That label, or the word the line would otherwise use. */
	label?: string | undefined;
	durationMs?: number | undefined;
}) {
	const [open, setOpen] = useState<boolean>();
	const shown = open ?? running;
	const title = label ?? (running ? "Thinking" : "Thought");
	const first = text.trim().split("\n")[0]?.trim() ?? "";
	const line = (
		<TraceLine status={running ? "running" : undefined}>
			<TraceIcon>
				<StepStatusIcon status={running ? "running" : "done"} />
			</TraceIcon>
			<TraceTitle>{title}</TraceTitle>
			{shown || hidden || first === "" ? undefined : (
				<span className="min-w-0 truncate text-muted-foreground/70">{first}</span>
			)}
			{durationMs === undefined ? undefined : (
				<TraceDescription>{secondsLabel(durationMs)}</TraceDescription>
			)}
		</TraceLine>
	);

	if (hidden || text === "") return <Trace>{line}</Trace>;

	return (
		<Trace>
			<TraceCollapsible open={shown} onOpenChange={setOpen}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted className="whitespace-pre-wrap">
					{text}
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
