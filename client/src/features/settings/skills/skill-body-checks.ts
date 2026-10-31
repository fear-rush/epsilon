import type { Diagnostic } from "@codemirror/lint";
import {
	SKILL_BODY_ADVISED_LINES,
	bodyLinks,
	bodySize,
	isRelativeTarget,
	missingBodyLinks,
} from "shared";

/**
 * The marks the editor draws in the body while it is typed. Nothing here blocks
 * a save: each mark is a reason to look again, not a rule the server enforces.
 */

/** The checks that have a place in the text, as marks in the editor. */
export const bodyDiagnostics = (body: string, files?: ReadonlySet<string>): Diagnostic[] => {
	const marks: Diagnostic[] = [];
	const { lines } = bodySize(body);
	if (lines > SKILL_BODY_ADVISED_LINES) {
		const start = body.split("\n").slice(0, SKILL_BODY_ADVISED_LINES).join("\n").length + 1;
		marks.push({
			from: Math.min(start, body.length),
			to: body.length,
			severity: "warning",
			message: `Past ${SKILL_BODY_ADVISED_LINES} lines pi still loads everything into context.`,
		});
	}
	for (const match of body.matchAll(/\$ARGUMENTS\b|\$\d\b|!`[^`\n]+`/g)) {
		marks.push({
			from: match.index,
			to: match.index + match[0].length,
			severity: "warning",
			message: "pi passes this through as text instead of expanding it.",
		});
	}
	const missing = files === undefined ? [] : missingBodyLinks(body, files);
	for (const link of bodyLinks(body)) {
		if (!isRelativeTarget(link.target)) continue;
		const lost = missing.some((entry) => entry.from === link.from);
		marks.push({
			from: link.from,
			to: link.to,
			severity: lost ? "warning" : "info",
			message: lost ? "Linked file not found in this skill." : "A file in the skill folder.",
		});
	}
	return marks;
};
