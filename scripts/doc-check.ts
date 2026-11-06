/**
 * Check that the agent docs say true things.
 *
 * bun run doc-check
 *
 * Reads `AGENTS.md` (root and per folder), `DESIGN.md` and `docs/**`,
 * and prints each failure as `file:line: what`: a link or backticked path that does not
 * exist, a `bun run` of a script `package.json` lacks, a rule ID cited but never defined
 * in a heading, a file over its size limit (docs/README.md, doc rule 3). Paths holding `<`
 * or `*` are placeholders and globs, and are skipped.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Schema } from "effect";

export type Failure = { readonly file: string; readonly line: number; readonly what: string };

const SKIP_DIRS = new Set(["node_modules", ".sandbox", "dist", ".git"]);
const PATH_ROOTS = /^(src|docs|scripts|test|tools)\//;

const walk = (root: string, dir: string, out: string[]): void => {
	for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) walk(root, path, out);
		} else if (entry.name.endsWith(".md")) {
			out.push(path);
		}
	}
};

/** The doc files under `root`, relative to it. */
export function docFiles(root: string): string[] {
	const found: string[] = [];
	walk(root, "", found);
	return found.filter(
		(file) =>
			file === "DESIGN.md" ||
			file === "AGENTS.md" ||
			file.endsWith("/AGENTS.md") ||
			file.startsWith("docs/"),
	);
}

/** The size limit of a doc file, in lines, from doc rule 3. */
function limitOf(file: string): number | undefined {
	if (file === "AGENTS.md") return 80;
	if (file.endsWith("/AGENTS.md")) return 25;
	if (/^docs\/rules\/(?!README)/.test(file)) return 150;
	if (file === "docs/map.md") return 150;
	if (/^docs\/decisions\/(?!README)/.test(file)) return 30;
	if (/^docs\/tasks\/(?!README)/.test(file)) return 40;
	return undefined;
}

const decodePackage = Schema.decodeUnknownSync(
	Schema.fromJsonString(
		Schema.Struct({ scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)) }),
	),
);

const placeholder = (text: string): boolean => /[<*]/.test(text);

const clean = (raw: string): string =>
	raw
		.replace(/[#?].*$/, "")
		.replace(/:\d+(-\d+)?$/, "")
		.replace(/[.,;:)]+$/, "");

/** Every failure in the docs under `root`. */
export function checkDocs(root: string): Failure[] {
	const failures: Failure[] = [];
	const files = docFiles(root);
	const scripts = new Set(
		Object.keys(decodePackage(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {}),
	);
	const defined = new Set<string>();
	const cited: Array<Failure & { id: string }> = [];

	for (const file of files) {
		const lines = readFileSync(join(root, file), "utf8").split("\n");
		const limit = limitOf(file);
		if (limit !== undefined && lines.length > limit + (lines.at(-1) === "" ? 1 : 0)) {
			failures.push({ file, line: 1, what: `${lines.length} lines, over its limit of ${limit}` });
		}
		let fenced = false;
		lines.forEach((text, index) => {
			const line = index + 1;
			if (text.trimStart().startsWith("```")) fenced = !fenced;
			if (/^#{1,6} /.test(text)) {
				for (const id of text.matchAll(/\b[A-Z]{2}-\d+\b/g)) defined.add(id[0]);
			}
			for (const id of text.matchAll(/\b[A-Z]{2}-\d+\b/g)) {
				cited.push({ file, line, what: `rule ${id[0]} is not defined in a heading`, id: id[0] });
			}
			if (fenced) return;
			for (const link of text.matchAll(/\]\(([^)\s]+)\)/g)) {
				const target = link[1] ?? "";
				if (/^([a-z]+:|#)/.test(target) || placeholder(target)) continue;
				const path = clean(target);
				if (path !== "" && !existsSync(resolve(root, dirname(file), path))) {
					failures.push({ file, line, what: `link ${target} does not exist` });
				}
			}
			for (const code of text.matchAll(/`([^`]+)`/g)) {
				const span = code[1] ?? "";
				// pi's own docs are in pi's package, not here: "pi's `docs/mcp.md`".
				const ownedByPi = text.slice(0, code.index).endsWith("pi's ");
				const run = /^bun run ([\w:.-]+)(?![\w/:.-])/.exec(span);
				if (run?.[1] !== undefined && !scripts.has(run[1])) {
					failures.push({ file, line, what: `bun run ${run[1]} is not a package.json script` });
				}
				if (ownedByPi || !PATH_ROOTS.test(span) || placeholder(span) || /\s/.test(span)) continue;
				const path = clean(span);
				if (!existsSync(join(root, path))) {
					failures.push({ file, line, what: `path ${span} does not exist` });
				}
			}
		});
	}
	for (const { id, ...failure } of cited) if (!defined.has(id)) failures.push(failure);
	return failures;
}

if (import.meta.main) {
	const root = resolve(import.meta.dirname, "..");
	const failures = checkDocs(root);
	for (const { file, line, what } of failures) process.stdout.write(`${file}:${line}: ${what}\n`);
	const count = docFiles(root).length;
	process.stdout.write(
		failures.length === 0
			? `doc-check: ${count} files, ok\n`
			: `doc-check: ${failures.length} failures in ${count} files\n`,
	);
	process.exit(failures.length === 0 ? 0 : 1);
}
