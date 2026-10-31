import { describe, expect, test } from "bun:test";

import {
	bodyLinks,
	bodySize,
	isRelativeTarget,
	missingBodyLinks,
	relativeBodyLinks,
	relativeTargetPath,
	resolveBodyLinkPath,
} from "./body";

describe("bodyLinks", () => {
	test("finds links and images with their lines and destination offsets", () => {
		const body = '# T\nSee [guide](docs/guide.md) and ![fig](img/a.png "A").';
		const links = bodyLinks(body);
		expect(links.map((l) => [l.text, l.target, l.line, l.image])).toEqual([
			["guide", "docs/guide.md", 2, false],
			["fig", "img/a.png", 2, true],
		]);
		for (const link of links) expect(body.slice(link.from, link.to)).toBe(link.target);
	});

	test("ignores code fences and inline code", () => {
		const body = "`[a](x.md)`\n```md\n[b](y.md)\n```\n[c](z.md)";
		expect(bodyLinks(body).map((l) => l.target)).toEqual(["z.md"]);
	});

	test("handles angle brackets and parentheses in a destination", () => {
		const links = bodyLinks("[a](<my file.md>) [b](f_(1).md)");
		expect(links.map((l) => l.target)).toEqual(["my file.md", "f_(1).md"]);
	});
});

describe("relative links", () => {
	test("keeps only links into the folder", () => {
		const body = "[a](https://x.dev) [b](#top) [c](mailto:a@b.c) [d](//cdn/x) [e](refs/e.md#part)";
		expect(relativeBodyLinks(body).map((l) => l.target)).toEqual(["refs/e.md#part"]);
		expect(isRelativeTarget("C:/x")).toBe(false);
		expect(isRelativeTarget("./x.md")).toBe(true);
	});

	test("strips the fragment and query from a path", () => {
		expect(relativeTargetPath("refs/a%20b.md#part")).toBe("refs/a b.md");
		expect(relativeTargetPath("a.md?x=1")).toBe("a.md");
	});
});

describe("bodySize", () => {
	test("counts lines without a trailing newline", () => {
		expect(bodySize("")).toEqual({ lines: 0, characters: 0 });
		expect(bodySize("a\nb\n")).toEqual({ lines: 2, characters: 4 });
	});
});

describe("missingBodyLinks", () => {
	const files = new Set(["SKILL.md", "references/a.md", "scripts/run.sh"]);

	test("resolves dots and ignores fragments", () => {
		expect(resolveBodyLinkPath("./references/../scripts/run.sh#x")).toBe("scripts/run.sh");
		expect(resolveBodyLinkPath("../outside.md")).toBeUndefined();
		expect(resolveBodyLinkPath("./")).toBeUndefined();
	});

	test("reports links to files the skill does not have", () => {
		const body = "[a](references/a.md#top) [b](references/b.md) [c](references/) [d](../x.md)";
		expect(missingBodyLinks(body, files).map((l) => l.target)).toEqual([
			"references/b.md",
			"../x.md",
		]);
	});
});
