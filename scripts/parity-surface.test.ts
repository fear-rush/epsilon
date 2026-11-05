import { expect, test } from "bun:test";

import { surfaceOf } from "./parity-surface.ts";

/**
 * The extraction has to survive a quote inside a template literal. A lexical pairing that
 * misses it swallows every string after it, and `bun run parity` then reports copy a port
 * does have as missing (04-safety.md).
 */

test("a quote inside a template does not swallow the strings after it", () => {
	const source = [
		'const thrown = `no words for error tag "${String(error)}"`;',
		'const offline = "Server not reachable";',
		'const box = { className: "mx-auto w-full" };',
	].join("\n");

	const surface = surfaceOf(source);

	expect(surface.copy.has("Server not reachable")).toBe(true);
	expect(surface.classes.has("mx-auto")).toBe(true);
	expect(surface.classes.has("w-full")).toBe(true);
});

test("a template without a substitution is copy, and one with it is not", () => {
	const source = [
		"const plain = `This page does not exist`;",
		"const named = `Remove ${name}?`;",
	].join("\n");

	const surface = surfaceOf(source);

	expect(surface.copy.has("This page does not exist")).toBe(true);
	expect(surface.copy.has("Remove ?")).toBe(false);
});
