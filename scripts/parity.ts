/**
 * Compares one of main's client files with the branch file(s) that port it, so "1:1"
 * is a check instead of a promise (the rebuild plan, archive/docs/plan/03-port.md). It reads two things out of string
 * literals and JSX text: the class tokens (layout, colour, motion) and the words a user
 * reads. Anything main has that the port lacks is printed, and the run fails.
 *
 * bun run parity <main path> <branch path> [<branch path>...]
 * bun run parity client/src/features/conversation/fork-dialog.tsx src/app/features/conversation/dialogs.tsx
 *
 * The extraction is lexical, not a parse: a token that moved into a shared component
 * shows as missing. Then pass that component's file as another branch path.
 */
import { readFileSync } from "node:fs";

import { merge, missing, surfaceOf } from "./parity-surface.ts";

const [mainPath, ...branchPaths] = process.argv.slice(2);
if (mainPath === undefined || branchPaths.length === 0) {
	console.error("usage: bun run parity <main path> <branch path> [<branch path>...]");
	process.exit(2);
}

const shown = Bun.spawnSync(["git", "show", `main:${mainPath}`]);
if (shown.exitCode !== 0) {
	console.error(`git show main:${mainPath} failed: ${shown.stderr.toString().trim()}`);
	process.exit(2);
}
const main = surfaceOf(shown.stdout.toString());
const branch = merge(branchPaths.map((path) => surfaceOf(readFileSync(path, "utf8"))));

const report = [
	{
		label: "class tokens main has and the port lacks",
		entries: missing(main.classes, branch.classes),
	},
	{ label: "copy main has and the port lacks", entries: missing(main.copy, branch.copy) },
	{
		label: "class tokens only the port has (check each)",
		entries: missing(branch.classes, main.classes),
	},
	{ label: "copy only the port has (check each)", entries: missing(branch.copy, main.copy) },
];
for (const { label, entries } of report) {
	if (entries.length === 0) continue;
	console.log(`\n${label} (${entries.length}):`);
	for (const entry of entries) console.log(`  ${entry}`);
}

const lost = (report[0]?.entries.length ?? 0) + (report[1]?.entries.length ?? 0);
console.log(lost === 0 ? "\nparity: nothing of main's is missing" : `\nparity: ${lost} missing`);
process.exit(lost === 0 ? 0 : 1);
