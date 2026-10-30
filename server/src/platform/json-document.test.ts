import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";

import { jsonDocument } from "./json-document";
import type { FilePolicy } from "./json-document";

const schema = z.looseObject({ items: z.record(z.string(), z.number()).optional() });

const open = async (policy: FilePolicy = "private") => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-document-"));
	const path = join(dir, "doc.json");
	const document = jsonDocument(path, {
		schema,
		empty: () => ({ items: {} }),
		policy,
		wording: {
			problem: (cause, file) => `${basename(file)}: ${cause}`,
			refusal: (file, problem) => `refused ${basename(file)}: ${problem}`,
		},
	});
	return { dir, path, document };
};

describe("json document read", () => {
	test("a missing file is the empty value with no problem", async () => {
		const { document } = await open();
		expect(await document.read()).toEqual({ value: { items: {} } });
	});

	test("strips a byte order mark", async () => {
		const { path, document } = await open();
		await writeFile(path, `﻿${JSON.stringify({ items: { a: 1 } })}`);
		expect((await document.read()).value).toEqual({ items: { a: 1 } });
	});

	test("names the cause and never quotes the file", async () => {
		const { path, document } = await open();
		await writeFile(path, "{ secret-token: nope");
		const invalid = await document.read();
		expect(invalid.problem).toBe("doc.json: not-json");
		expect(invalid.problem).not.toContain("secret");

		await writeFile(path, JSON.stringify({ items: "wrong" }));
		expect((await document.read()).problem).toBe("doc.json: wrong-shape");
	});

	test("reports a directory and an oversized file", async () => {
		const { dir, path, document } = await open();
		await writeFile(path, "x".repeat(1_000_001));
		expect((await document.read()).problem).toBe("doc.json: too-large");

		const folder = jsonDocument(dir, {
			schema,
			empty: () => ({}),
			policy: "private",
			wording: { problem: (cause) => cause, refusal: () => "no" },
		});
		expect((await folder.read()).problem).toBe("not-file");
	});
});

describe("json document update", () => {
	test("writes the content with mode 0600 and leaves no temp file", async () => {
		const { dir, path, document } = await open("private");
		await document.update((current) => ({ ...current, items: { a: 1 }, extra: true }));

		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ items: { a: 1 }, extra: true });
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect(await readdir(dir)).toEqual(["doc.json"]);
	});

	test("a project file keeps its mode, or is created 0644", async () => {
		const created = await open("project");
		await created.document.update(() => ({ items: {} }));
		expect((await stat(created.path)).mode & 0o777).toBe(0o644);

		const existing = await open("project");
		await writeFile(existing.path, "{}");
		await chmod(existing.path, 0o664);
		await existing.document.update(() => ({ items: { a: 1 } }));
		expect((await stat(existing.path)).mode & 0o777).toBe(0o664);
	});

	test("serializes concurrent updates, so none is lost", async () => {
		const { path, document } = await open();
		await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				document.update((current) => ({ items: { ...current.items, [`k${index}`]: index } })),
			),
		);
		const written = JSON.parse(await readFile(path, "utf8"));
		expect(Object.keys(written.items)).toHaveLength(12);
	});

	test("refuses to replace a file it cannot parse, and leaves it alone", async () => {
		const { dir, path, document } = await open();
		await writeFile(path, "{ not json");
		await expect(document.update(() => ({ items: {} }))).rejects.toThrow(
			"refused doc.json: doc.json: not-json",
		);
		expect(await readFile(path, "utf8")).toBe("{ not json");
		expect(await readdir(dir)).toEqual(["doc.json"]);
	});

	test("returning undefined writes nothing", async () => {
		const { path, document } = await open();
		await document.update(() => undefined);
		expect(await Bun.file(path).exists()).toBe(false);
	});

	test("an update that throws leaves the file and the queue usable", async () => {
		const { path, document } = await open();
		await writeFile(path, JSON.stringify({ items: { a: 1 } }));
		await expect(
			document.update(() => {
				throw new Error("refused by the caller");
			}),
		).rejects.toThrow("refused by the caller");
		await document.update((current) => ({ items: { ...current.items, b: 2 } }));
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ items: { a: 1, b: 2 } });
	});

	test("writes through a symlink instead of replacing it", async () => {
		const { dir } = await open();
		const real = join(dir, "real.json");
		await writeFile(real, JSON.stringify({ items: { a: 1 } }));
		const link = join(dir, "link.json");
		await symlink(real, link);
		const linked = jsonDocument(link, {
			schema,
			empty: () => ({}),
			policy: "private",
			wording: { problem: (cause) => cause, refusal: (_file, problem) => problem },
		});
		await linked.update((current) => ({ ...current, items: { a: 2 } }));
		expect(JSON.parse(await readFile(real, "utf8"))).toEqual({ items: { a: 2 } });
		expect((await stat(link)).isFile()).toBe(true);
	});
});
