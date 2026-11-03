import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repository = resolve(import.meta.dirname, "../../..");
const oxlint = join(repository, "node_modules/.bin/oxlint");
const plugin = join(repository, "tools/oxlint/epsilon/index.ts");
const scratch = mkdtempSync(join(tmpdir(), "epsilon-lint-"));

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

type Case = {
	readonly rule: string;
	readonly source: string;
	readonly options?: unknown;
};

/** Lints one fixture with one epsilon rule and returns what Oxlint printed. */
function lint({ rule, source, options }: Case, name: string): string {
	const file = join(scratch, `${name}.ts`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	const config = join(scratch, `${name}.json`);
	const entry = options === undefined ? "error" : ["error", options];
	writeFileSync(
		config,
		JSON.stringify({ jsPlugins: [plugin], rules: { [`epsilon/${rule}`]: entry } }),
	);
	const run = Bun.spawnSync([oxlint, "--config", config, file], { cwd: repository });
	return `${run.stdout.toString()}${run.stderr.toString()}`;
}

describe("epsilon plugin", () => {
	test("no-real-sleep catches a real wait and a real clock read", () => {
		const output = lint(
			{
				rule: "no-real-sleep",
				source: [
					"export async function wait(): Promise<void> {",
					"\tawait Bun.sleep(100);",
					"\tconst started = Date.now();",
					"\tif (started > 0) setTimeout(() => undefined, 10);",
					"}",
				].join("\n"),
			},
			"sleep",
		);

		expect(output).toContain("no-real-sleep");
		expect(output).toContain("Bun.sleep()");
		expect(output).toContain("Date.now()");
	});

	test("effect-only-io names the replacement for imperative IO", () => {
		const output = lint(
			{
				rule: "effect-only-io",
				source: [
					'import { readFileSync } from "node:fs";',
					"",
					"export function read(path: string): string {",
					"\ttry {",
					"\t\treturn readFileSync(path, 'utf8');",
					"\t} catch {",
					"\t\tthrow new Error('missing');",
					"\t}",
					"}",
				].join("\n"),
			},
			"io",
		);

		expect(output).toContain("`node:fs` bypasses the platform layer");
		expect(output).toContain("try/catch");
		expect(output).toContain("`throw`");
	});

	test("no-feature-internals allows an index import and refuses an internal one", () => {
		const features = join(scratch, "features");
		const source = [
			'import { a } from "../sessions/index.ts";',
			'import { b } from "../sessions/store.ts";',
			"export const used = `${a}${b}`;",
		].join("\n");

		const output = lint(
			{
				rule: "no-feature-internals",
				source,
				options: { root: features, open: [] },
			},
			"features/panel/view",
		);

		expect(output).toContain("../sessions/store.ts");
		expect(output).not.toContain("../sessions/index.ts");
	});
});
