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

	test("no-feature-internals refuses a feature import from a shared layer", () => {
		const source =
			'import { a } from "../../features/sessions/index.ts";\nexport const used = a;\n';

		const output = lint(
			{
				rule: "no-feature-internals",
				source,
				options: { root: join(scratch, "app/features"), shared: [join(scratch, "app/components")] },
			},
			"app/components/patterns/panel",
		);

		expect(output).toContain("from a shared layer");
		expect(output).toContain("../../features/sessions/index.ts");
	});

	test("feedback-surfaces refuses the alert banner and a state colour a feature painted", () => {
		const output = lint(
			{
				rule: "feedback-surfaces",
				source: [
					'import { Alert } from "@/components/ui/alert";',
					'import { cn } from "@/lib/cn";',
					"",
					'export const tone = cn("text-destructive", "dark:hover:border-warning/40");',
					"export const banner = Alert;",
				].join("\n"),
			},
			"surfaces",
		);

		expect(output).toContain("@/components/ui/alert");
		expect(output).toContain("text-destructive");
		expect(output).toContain("dark:hover:border-warning/40");
	});

	test("feedback-surfaces allows the surfaces, semantic tokens and alert-dialog", () => {
		const output = lint(
			{
				rule: "feedback-surfaces",
				source: [
					'import { Notice } from "@/components/patterns/status/notice";',
					'import { AlertDialog } from "@/components/ui/alert-dialog";',
					'import { cn } from "@/lib/cn";',
					"",
					'export const text = cn("text-muted-foreground", "bg-background", "border-border");',
					"export const ui = [Notice, AlertDialog];",
				].join("\n"),
			},
			"surfaces-clean",
		);

		expect(output).not.toContain("feedback-surfaces");
	});

	test("disable-reason refuses a bare disable and accepts one with a reason", () => {
		const bare = lint(
			{
				rule: "disable-reason",
				source: "// oxlint-disable-next-line no-console\nexport const a = 1;\n",
			},
			"disable-bare",
		);
		const reasoned = lint(
			{
				rule: "disable-reason",
				source: "// oxlint-disable-next-line no-console -- the CLI prints\nexport const a = 1;\n",
			},
			"disable-reasoned",
		);

		expect(bare).toContain("This disable has no reason");
		expect(reasoned).not.toContain("This disable has no reason");
	});

	test("disable-reason keeps design-tokens disabled only in the vendored folders", () => {
		const source =
			"// oxlint-disable-next-line epsilon/design-tokens -- a reason\nexport const a = 1;\n";
		const feature = lint({ rule: "disable-reason", source }, "src/app/features/x/disable");
		const vendored = lint({ rule: "disable-reason", source }, "src/app/components/ui/disable");

		expect(feature).toContain("`epsilon/design-tokens` cannot be disabled here");
		expect(vendored).not.toContain("cannot be disabled here");
	});
});
