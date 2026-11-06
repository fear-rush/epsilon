import type { ParsedStack, StackFrame } from "@/components/ai-elements/stack-trace";

const FRAME = /^\s*at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))\s*$/;
const INTERNAL = /(^|\/)(?:node_modules|bun:internal|node:internal)\b|^node:|^bun:/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const internalOf = (file: string): boolean => INTERNAL.test(file);

/**
 * The frames in a failed tool's output, if it printed a stack at all. A tool that fails
 * with one line keeps its plain error; a stack is worth folding into app frames and
 * runtime frames, because the runtime's rows are the ones that bury the point.
 */
export function stackTraceOf(output: string): ParsedStack | undefined {
	const lines = output.replaceAll(ANSI, "").split("\n");
	const frames: StackFrame[] = [];
	for (const [index, line] of lines.entries()) {
		const match = FRAME.exec(line);
		if (match === null) continue;
		const file = match[2] ?? match[5];
		const lineNumber = match[3] ?? match[6];
		frames.push({
			file,
			internal: file === undefined ? false : internalOf(file),
			key: `${index}:${line}`,
			line: line.trim(),
			lineNumber,
			name: match[1],
		});
	}
	if (frames.length === 0) return undefined;

	const error = lines.find((line) => line.trim() !== "")?.trim() ?? "The tool failed";
	return { error, frames };
}
