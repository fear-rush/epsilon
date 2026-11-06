import type { TestResult, TestSuite, TestSummary } from "@/components/ai-elements/test-results";

const TEST_COMMAND =
	/(^|\s)(bun\s+test|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test|vitest|jest|pytest|cargo\s+test|go\s+test|mix\s+test|rspec)(\s|$)/i;

/** Terminal colour is not part of a reading; a count parsed from it would be a guess. */
const ESCAPE = String.fromCharCode(27);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");

const numberIn = (pattern: RegExp, text: string): number | undefined => {
	const value = pattern.exec(text)?.[1];
	if (value === undefined) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const suiteName = /^(\S+\.(?:[cm]?[jt]sx?|py|rb|ex|exs)):$/;
const testLine = /^\s*([✓✔✗✘×])\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/;

/** The suites a runner named, with the tests it printed under each one. */
function suitesIn(lines: ReadonlyArray<string>): ReadonlyArray<TestSuite> {
	const suites: TestSuite[] = [];
	let current: { name: string; tests: TestResult[] } | undefined;
	for (const line of lines) {
		const header = suiteName.exec(line.trim());
		if (header?.[1] !== undefined) {
			current = { name: header[1], tests: [] };
			suites.push(current);
			continue;
		}
		const test = testLine.exec(line);
		if (test === null) continue;
		const mark = test[1];
		const name = test[2];
		if (mark === undefined || name === undefined) continue;
		const status: TestResult["status"] =
			mark === "✗" || mark === "✘" || mark === "×" ? "failed" : "passed";
		if (current === undefined) {
			current = { name: "Tests", tests: [] };
			suites.push(current);
		}
		current.tests.push({ name, status });
	}
	return suites;
}

/**
 * What a test command's output says. The reading is deliberately narrow: a count has to
 * be printed by a runner this page knows, so an output it cannot read stays a Terminal
 * and nobody is told a test passed by a pattern that happened to match.
 */
export function testResultsOf(command: string, output: string): TestSummary | undefined {
	if (!TEST_COMMAND.test(command)) return undefined;
	const text = output.replaceAll(ANSI, "");
	const lines = text.split("\n");

	const bunPassed = numberIn(/^\s*(\d+)\s+pass\b/im, text);
	const bunFailed = numberIn(/^\s*(\d+)\s+fail\b/im, text);
	const bunRan = numberIn(/\bRan\s+(\d+)\s+tests?\b/i, text);
	const vitestLine = /^\s*Tests\s+(.+)$/im.exec(text)?.[1];
	const jestLine = /^\s*Tests:\s+(.+)$/im.exec(text)?.[1];
	const pytestLine = /\b(\d+\s+passed(?:,\s*\d+\s+failed)?(?:,\s*\d+\s+skipped)?)/i.exec(text)?.[1];

	const countFrom = (value: string | undefined) => {
		if (value === undefined) return undefined;
		return {
			failed: numberIn(/(\d+)\s+failed/i, value) ?? 0,
			passed: numberIn(/(\d+)\s+passed/i, value) ?? 0,
			skipped: numberIn(/(\d+)\s+skipped/i, value) ?? 0,
		};
	};

	const counts =
		bunPassed === undefined && bunFailed === undefined
			? (countFrom(vitestLine) ?? countFrom(jestLine) ?? countFrom(pytestLine))
			: { failed: bunFailed ?? 0, passed: bunPassed, skipped: 0 };
	if (counts?.passed === undefined) return undefined;

	const total =
		bunRan ??
		numberIn(/\((\d+)\)\s*$/i, vitestLine ?? "") ??
		numberIn(/(\d+)\s+total\b/i, jestLine ?? "") ??
		counts.passed + counts.failed + counts.skipped;
	if (total === 0) return undefined;

	const suiteTotal = counts.failed + counts.passed + counts.skipped;
	if (suiteTotal === 0) return undefined;

	const duration =
		numberIn(/\[(\d+(?:\.\d+)?)s\]/i, text) ??
		numberIn(/\bin\s+(\d+(?:\.\d+)?)s\b/i, text) ??
		undefined;

	const summary: TestSummary = {
		failed: counts.failed,
		passed: counts.passed,
		skipped: counts.skipped,
		suites: suitesIn(lines),
		total,
	};
	return duration === undefined ? summary : { ...summary, durationMs: duration * 1000 };
}
