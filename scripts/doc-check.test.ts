import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { checkDocs } from "./doc-check.ts";

const scratch = mkdtempSync(join(tmpdir(), "epsilon-doc-check-"));

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** A repository with a package.json, one source file and the given docs. */
function fixture(name: string, docs: Record<string, string>): string {
	const root = join(scratch, name);
	const files: Record<string, string> = {
		"package.json": JSON.stringify({ scripts: { check: "true" } }),
		"src/real.ts": "export {};\n",
		...docs,
	};
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, file)), { recursive: true });
		writeFileSync(join(root, file), text);
	}
	return root;
}

describe("doc-check", () => {
	test("passes docs whose links, paths, scripts and rule IDs all exist", () => {
		const root = fixture("good", {
			"AGENTS.md": "# Root\n\nSee [rules](docs/rules/x.md), `src/real.ts` and `bun run check`.\n",
			"docs/rules/x.md": "### XX-1 · A rule\n\nSee XX-1 and `src/<name>/*.ts`.\n",
		});

		expect(checkDocs(root)).toEqual([]);
	});

	test("reports a missing link, path, script, rule ID and an oversized folder file", () => {
		const root = fixture("bad", {
			"AGENTS.md": [
				"# Root",
				"[gone](docs/gone.md)",
				"`src/missing.ts`",
				"`bun run nothing`",
				"Cites XX-9.",
			].join("\n"),
			"src/AGENTS.md": "line\n".repeat(30),
		});

		const text = checkDocs(root)
			.map(({ file, line, what }) => `${file}:${line}: ${what}`)
			.join("\n");

		expect(text).toContain("AGENTS.md:2: link docs/gone.md does not exist");
		expect(text).toContain("AGENTS.md:3: path src/missing.ts does not exist");
		expect(text).toContain("AGENTS.md:4: bun run nothing is not a package.json script");
		expect(text).toContain("AGENTS.md:5: rule XX-9 is not defined in a heading");
		expect(text).toContain("src/AGENTS.md:1: 31 lines, over its limit of 25");
	});
});
