import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * F4: nothing in Epsilon's runtime may call pi's `listAll`.
 *
 * Its only use is the conformance test, where it is the oracle. A runtime fallback would
 * parse every session file on the request path again, which is the behaviour the index
 * exists to remove.
 */

const sourceRoot = new URL("../../", import.meta.url).pathname;
const allowed = new Set(["platform/pi.ts"]);

const sourceFiles = (): ReadonlyArray<string> =>
	readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".ts"))
		// Tests may name it: the conformance test is the oracle, and this test scans itself.
		.filter((file) => !file.endsWith(".test.ts"))
		.filter((file) => !allowed.has(file));

describe("listAll", () => {
	test("is called by the conformance test only", () => {
		const offenders = sourceFiles().filter((file) =>
			readFileSync(join(sourceRoot, file), "utf8").includes("listAll("),
		);
		expect(offenders).toEqual([]);
	});
});
