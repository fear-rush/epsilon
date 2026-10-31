/** Asks the real registries. Skipped unless `EPSILON_NETWORK_TESTS=1`. */
import { describe, expect, test } from "bun:test";

import { readRegistryServer, searchRegistry } from "./service";
import type { Fetcher } from "./service";

const live: Fetcher = (url, init) => fetch(url, init);

describe.skipIf(process.env["EPSILON_NETWORK_TESTS"] !== "1")("live registries", () => {
	test("the official registry searches and describes a server", async () => {
		const page = await searchRegistry(live, { source: "official", q: "fetch" });
		expect(page.items.length).toBeGreaterThan(0);
		const first = page.items[0];
		if (first === undefined) throw new Error("no item");
		const detail = await readRegistryServer(live, "official", first.name);
		expect(detail.name).toBe(first.name);
		expect(detail.options.length).toBeGreaterThan(0);
	});

	test("GitHub's registry searches", async () => {
		const page = await searchRegistry(live, { source: "github", q: "fetch" });
		expect(page.items.length).toBeGreaterThan(0);
	});
});
