import { CheckIcon, CircleDashedIcon, FileCodeIcon, FlaskConicalIcon, XIcon } from "lucide-react";

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

export type TestResultStatus = "passed" | "failed" | "skipped";

export type TestResult = {
	readonly name: string;
	readonly status: TestResultStatus;
	readonly error?: string;
};

export type TestSuite = {
	readonly name: string;
	readonly tests: ReadonlyArray<TestResult>;
};

export type TestSummary = {
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly skipped: number;
	readonly durationMs?: number;
	readonly suites: ReadonlyArray<TestSuite>;
};

const countsOf = (tests: ReadonlyArray<TestResult>) => ({
	failed: tests.filter((test) => test.status === "failed").length,
	skipped: tests.filter((test) => test.status === "skipped").length,
	total: tests.length,
});

const countsLabel = ({ total, failed, skipped }: ReturnType<typeof countsOf>): string =>
	[
		`${total} ${total === 1 ? "test" : "tests"}`,
		failed > 0 ? `${failed} failed` : "",
		skipped > 0 ? `${skipped} skipped` : "",
	]
		.filter((part) => part !== "")
		.join(", ");

const secondsLabel = (durationMs: number): string => `${(durationMs / 1000).toFixed(1)}s`;

function TestRow({ test }: { test: TestResult }) {
	if (test.status === "failed") {
		if (test.error === undefined) {
			return (
				<TraceLine status="error">
					<TraceIcon>
						<XIcon />
					</TraceIcon>
					<TraceTitle>{test.name}</TraceTitle>
				</TraceLine>
			);
		}
		return (
			<TraceCollapsible defaultOpen>
				<TraceCollapsibleTrigger>
					<TraceLine status="error">
						<TraceIcon>
							<XIcon />
						</TraceIcon>
						<TraceTitle>{test.name}</TraceTitle>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<CodeBlock size="sm" variant="destructive">
						<CodeBlockContent wrap className="max-h-64">
							{test.error}
						</CodeBlockContent>
					</CodeBlock>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		);
	}
	return (
		<TraceLine>
			<TraceIcon>{test.status === "skipped" ? <CircleDashedIcon /> : <CheckIcon />}</TraceIcon>
			<TraceTitle>{test.status === "skipped" ? `Skipped ${test.name}` : test.name}</TraceTitle>
		</TraceLine>
	);
}

function SuiteRow({ suite }: { suite: TestSuite }) {
	const counts = countsOf(suite.tests);
	if (counts.failed === 0) {
		return (
			<TraceLine>
				<TraceIcon>
					<FileCodeIcon />
				</TraceIcon>
				<TraceTitle>
					{suite.name}, {countsLabel(counts)}
				</TraceTitle>
			</TraceLine>
		);
	}
	return (
		<TraceCollapsible defaultOpen>
			<TraceCollapsibleTrigger>
				<TraceLine status="error">
					<TraceIcon>
						<FileCodeIcon />
					</TraceIcon>
					<TraceTitle>
						{suite.name}, {countsLabel(counts)}
					</TraceTitle>
				</TraceLine>
			</TraceCollapsibleTrigger>
			<TraceCollapsibleContent keepMounted>
				<Trace>
					{suite.tests.map((test) => (
						<TestRow key={test.name} test={test} />
					))}
				</Trace>
			</TraceCollapsibleContent>
		</TraceCollapsible>
	);
}

/**
 * A test run the agent made, with its suites and failures. The parser that fills this is
 * strict: an output it cannot read stays a Terminal, so the page never guesses a count.
 */
export function TestResults({
	summary,
	open,
	onOpenChange,
}: {
	summary: TestSummary;
	open?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
}) {
	const empty = summary.total === 0 && summary.suites.length === 0;
	const disclosure = useDisclosure({
		defaultOpen: summary.failed > 0,
		onOpenChange,
		open,
	});
	const summaryCounts = {
		failed: summary.failed,
		skipped: summary.skipped,
		total: summary.total,
	};
	const line = (
		<TraceLine status={summary.failed > 0 ? "error" : undefined}>
			<TraceIcon>
				{summary.failed > 0 ? <StepStatusIcon status="error" /> : <FlaskConicalIcon />}
			</TraceIcon>
			<TraceTitle>Ran {countsLabel(summaryCounts)}</TraceTitle>
			{summary.durationMs === undefined ? undefined : (
				<TraceDescription>{secondsLabel(summary.durationMs)}</TraceDescription>
			)}
		</TraceLine>
	);

	if (empty || summary.suites.length === 0) return <Trace>{line}</Trace>;

	return (
		<Trace>
			<TraceCollapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<Trace>
						{summary.suites.map((suite) => (
							<SuiteRow key={suite.name} suite={suite} />
						))}
					</Trace>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
