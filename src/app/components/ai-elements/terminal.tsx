import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
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
import { useDisclosure } from "./use-disclosure";

/** The words a command's line uses, from what it has done so far. */
const lineTitle = (
	command: string,
	running: boolean,
	failed: boolean,
	title: string | undefined,
): string => {
	if (title !== undefined) return title;
	if (running) return `Running ${command}`;
	if (failed) return `Failed to run ${command}`;
	return `Ran ${command}`;
};

/**
 * A shell command the agent ran, with its output. The output opens as soon as there is
 * some while the command runs; a finished command opens on request. The terminal line is
 * the same Trace shape as every other step, so a call, a plan and a thought line up.
 */
export function Terminal({
	command,
	output,
	running,
	failed,
	description,
	title,
	open,
	onOpenChange,
}: {
	command: string;
	output: string;
	running: boolean;
	failed: boolean;
	description?: string | undefined;
	/** Overrides the line's words, for a command the page holds rather than the agent. */
	title?: string | undefined;
	open?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
}) {
	const disclosure = useDisclosure({
		defaultOpen: running && output !== "",
		onOpenChange,
		open,
	});
	const status: "running" | "error" | undefined = running
		? "running"
		: failed
			? "error"
			: undefined;
	const line = (
		<TraceLine status={status}>
			<TraceIcon>
				<StepStatusIcon status={status ?? "done"} />
			</TraceIcon>
			<TraceTitle>{lineTitle(command, running, failed, title)}</TraceTitle>
			{description === undefined ? undefined : <TraceDescription>{description}</TraceDescription>}
		</TraceLine>
	);

	if (output === "") return <Trace>{line}</Trace>;

	return (
		<Trace>
			<TraceCollapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<CodeBlock size="sm">
						<CodeBlockContent wrap className="max-h-64">
							{output}
						</CodeBlockContent>
					</CodeBlock>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
