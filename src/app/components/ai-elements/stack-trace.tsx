import { FileCodeIcon, LayersIcon } from "lucide-react";

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

import { StepStatusIcon } from "./status-icon";
import { useDisclosure } from "./use-disclosure";

export type StackFrame = {
	readonly key: string;
	/** The line as the tool wrote it, for a frame a parser cannot read. */
	readonly line: string;
	readonly name: string | undefined;
	readonly file: string | undefined;
	readonly lineNumber: string | undefined;
	/** A frame from a runtime or a dependency, folded away from the app's own frames. */
	readonly internal: boolean;
};

export type ParsedStack = {
	readonly error: string;
	readonly frames: ReadonlyArray<StackFrame>;
};

/** The words a frame's line uses, from the parts the parser found. */
const frameLabel = (frame: StackFrame): string => {
	if (frame.file === undefined) return frame.line;
	const where = `${frame.file}${frame.lineNumber === undefined ? "" : `:${frame.lineNumber}`}`;
	return frame.name === undefined ? where : `${frame.name} in ${where}`;
};

/**
 * A failed tool call and its stack frames. The error is the loud part; the app's frames
 * are rows a reader can scan, and the runtime's frames fold into one row so they do not
 * bury the ones that name this project's code.
 */
export function StackTrace({
	stack,
	open,
	onOpenChange,
}: {
	stack: ParsedStack;
	open?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
}) {
	const disclosure = useDisclosure({ defaultOpen: true, onOpenChange, open });
	const appFrames = stack.frames.filter((frame) => !frame.internal);
	const internalFrames = stack.frames.filter((frame) => frame.internal);

	return (
		<Trace>
			<TraceCollapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
				<TraceCollapsibleTrigger>
					<TraceLine status="error">
						<TraceIcon>
							<StepStatusIcon status="error" />
						</TraceIcon>
						<TraceTitle>Failed: {stack.error}</TraceTitle>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted className="flex flex-col gap-2">
					<CodeBlock size="sm" variant="destructive">
						<CodeBlockContent wrap className="max-h-40">
							{stack.error}
						</CodeBlockContent>
					</CodeBlock>
					<Trace>
						{appFrames.map((frame) => (
							<TraceLine key={frame.key}>
								<TraceIcon>
									<FileCodeIcon />
								</TraceIcon>
								<TraceTitle>{frameLabel(frame)}</TraceTitle>
							</TraceLine>
						))}
						{internalFrames.length === 0 ? undefined : (
							<TraceCollapsible>
								<TraceCollapsibleTrigger>
									<TraceLine>
										<TraceIcon>
											<LayersIcon />
										</TraceIcon>
										<TraceTitle>
											{internalFrames.length} framework{" "}
											{internalFrames.length === 1 ? "frame" : "frames"}
										</TraceTitle>
									</TraceLine>
								</TraceCollapsibleTrigger>
								<TraceCollapsibleContent keepMounted>
									<ol className="flex flex-col gap-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-meta">
										{internalFrames.map((frame) => (
											<li key={frame.key} className="whitespace-nowrap">
												{frame.line}
											</li>
										))}
									</ol>
								</TraceCollapsibleContent>
							</TraceCollapsible>
						)}
					</Trace>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
