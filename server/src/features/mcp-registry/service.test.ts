/** The two routes, answered from fixtures: no test here touches the network. */
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { mcpRegistryRoutes } from "./routes";
import type { Fetcher } from "./service";

type Reply = { status?: number; body?: object; text?: string } | Error;

/** A fetcher that answers by URL substring and records every URL it was asked. */
const fake = (replies: Record<string, Reply>) => {
	const calls: { url: string; headers: Record<string, string> }[] = [];
	const fetcher: Fetcher = async (url, init) => {
		calls.push({ url, headers: init.headers });
		const key = Object.keys(replies).find((candidate) => url.includes(candidate));
		const reply = key === undefined ? { status: 404 } : replies[key];
		if (reply instanceof Error) throw reply;
		if (reply === undefined) return new Response("{}", { status: 404 });
		return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
			status: reply.status ?? 200,
		});
	};
	return { fetcher, calls };
};

const bodySchema = z.looseObject({ message: z.string().optional(), note: z.string().optional() });

const get = async (fetcher: Fetcher, path: string) => {
	const response = await mcpRegistryRoutes(fetcher).request(path);
	const json: unknown = await response.json();
	return { status: response.status, body: bodySchema.parse(json), json };
};

const officialList = {
	servers: [
		{
			server: {
				name: "io.example/fetch",
				description: "Fetch pages",
				version: "1.0.0",
				repository: { url: "https://github.com/example/fetch", source: "github" },
				packages: [{ registryType: "npm", identifier: "fetch-mcp", version: "1.0.0" }],
			},
			_meta: {},
		},
	],
	metadata: { nextCursor: "io.example/fetch:1.0.0", count: 1 },
};

describe("search", () => {
	test("asks the official registry for latest versions with the query and cursor", async () => {
		const { fetcher, calls } = fake({ "/v0/servers?": { body: officialList } });
		const { status, json } = await get(
			fetcher,
			"/api/settings/mcp/registry/search?source=official&q=fetch&cursor=abc",
		);
		expect(status).toBe(200);
		const url = new URL(calls[0]?.url ?? "");
		expect(url.origin + url.pathname).toBe("https://registry.modelcontextprotocol.io/v0/servers");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			limit: "20",
			version: "latest",
			search: "fetch",
			cursor: "abc",
		});
		expect(calls[0]?.headers["User-Agent"]).toBe("epsilon");
		expect(json).toEqual({
			items: [
				{
					source: "official",
					name: "io.example/fetch",
					title: "io.example/fetch",
					description: "Fetch pages",
					version: "1.0.0",
					repositoryUrl: "https://github.com/example/fetch",
					kinds: ["npm"],
				},
			],
			nextCursor: "io.example/fetch:1.0.0",
		});
	});

	test("a query under three characters browses instead of searching", async () => {
		const { fetcher, calls } = fake({ "/v0/servers?": { body: officialList } });
		await get(fetcher, "/api/settings/mcp/registry/search?source=official&q=ab");
		expect(new URL(calls[0]?.url ?? "").searchParams.has("search")).toBe(false);
	});

	test("falls back to /v0.1 when /v0 is not there", async () => {
		const { fetcher, calls } = fake({
			"/v0.1/servers?": { body: officialList },
		});
		const { status } = await get(fetcher, "/api/settings/mcp/registry/search?source=official");
		expect(status).toBe(200);
		expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
			"/v0/servers",
			"/v0.1/servers",
		]);
	});

	test("reads GitHub's snake_case page and cursor", async () => {
		const { fetcher, calls } = fake({
			"api.mcp.github.com": {
				body: {
					servers: [
						{
							server: {
								name: "microsoft/markitdown",
								description: "Convert",
								packages: [
									{
										name: "markitdown-mcp",
										registry_name: "",
										runtime_hint: "uvx",
										version: "0.1",
									},
								],
								remotes: null,
								repository: { url: "https://github.com/microsoft/markitdown" },
								version_detail: { version: "1.0.0" },
							},
						},
					],
					metadata: { next_cursor: "next1", count: 1 },
				},
			},
		});
		const { json } = await get(fetcher, "/api/settings/mcp/registry/search?source=github&q=mark");
		expect(new URL(calls[0]?.url ?? "").searchParams.get("search")).toBe("mark");
		expect(json).toMatchObject({
			nextCursor: "next1",
			items: [
				{ source: "github", name: "microsoft/markitdown", version: "1.0.0", kinds: ["pypi"] },
			],
		});
	});

	test("an upstream failure is a 502 with a sentence", async () => {
		const { fetcher } = fake({ "/v0/servers": { status: 500 } });
		const { status, body } = await get(
			fetcher,
			"/api/settings/mcp/registry/search?source=official",
		);
		expect(status).toBe(502);
		expect(body.message).toBe("The official registry answered 500");
	});

	test("a network error is reported, not swallowed", async () => {
		const { fetcher } = fake({ "api.mcp.github.com": new Error("connect ECONNREFUSED") });
		const { status, body } = await get(fetcher, "/api/settings/mcp/registry/search?source=github");
		expect(status).toBe(502);
		expect(body.message).toBe("GitHub's registry could not be reached: connect ECONNREFUSED");
	});

	test("an answer of an unknown shape is a 502", async () => {
		const { fetcher } = fake({ "/v0/servers": { body: { servers: "nope" } } });
		const { status, body } = await get(
			fetcher,
			"/api/settings/mcp/registry/search?source=official",
		);
		expect(status).toBe(502);
		expect(body.message).toContain("cannot read");
	});

	test("an answer that is not JSON is a 502", async () => {
		const { fetcher } = fake({ "/v0/servers": { text: "<html>" } });
		const { status, body } = await get(
			fetcher,
			"/api/settings/mcp/registry/search?source=official",
		);
		expect(status).toBe(502);
		expect(body.message).toContain("not JSON");
	});
});

describe("server", () => {
	const official = {
		server: {
			name: "io.example/fetch",
			description: "Fetch pages",
			title: "Fetch",
			version: "1.0.0",
			packages: [
				{
					registryType: "npm",
					identifier: "fetch-mcp",
					version: "1.0.0",
					environmentVariables: [{ name: "KEY", isRequired: true, isSecret: true }],
				},
				{ registryType: "nuget", identifier: "Fetch", version: "1.0.0" },
			],
			remotes: [{ type: "streamable-http", url: "https://fetch.example/mcp" }],
		},
	};

	test("looks the name up url-encoded and maps its options", async () => {
		const { fetcher, calls } = fake({ "/versions/latest": { body: official } });
		const { status, body, json } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=official&name=io.example%2Ffetch",
		);
		expect(status).toBe(200);
		expect(calls[0]?.url).toBe(
			"https://registry.modelcontextprotocol.io/v0/servers/io.example%2Ffetch/versions/latest",
		);
		expect(json).toMatchObject({
			name: "io.example/fetch",
			title: "Fetch",
			options: [
				{ id: "package:0", supported: true },
				{ id: "package:1", supported: false },
				{ id: "remote:0", supported: true },
			],
		});
		expect(body.note).toBeUndefined();
	});

	test("an unknown name is a 404", async () => {
		const { fetcher } = fake({});
		const { status } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=official&name=a%2Fb",
		);
		expect(status).toBe(404);
	});

	test("GitHub prefers the official entry of the same name", async () => {
		const { fetcher, calls } = fake({ "/versions/latest": { body: official } });
		const { status, body } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=github&name=io.example%2Ffetch",
		);
		expect(status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(body.note).toBeUndefined();
	});

	test("GitHub falls back to its own entry, with a note", async () => {
		const { fetcher } = fake({
			"api.mcp.github.com": {
				body: {
					servers: [
						{ server: { name: "other/thing", packages: [] } },
						{
							server: {
								name: "acme/thing",
								description: "Thing",
								remotes: [
									{
										transport_type: "streamable-http",
										url: "https://thing.test/mcp",
										headers: [{ is_secret: true, value: "Bearer {TOKEN}" }],
									},
								],
							},
						},
					],
					metadata: {},
				},
			},
		});
		const { status, body, json } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=github&name=acme%2Fthing",
		);
		expect(status).toBe(200);
		expect(body.note).toBe("From GitHub's registry: environment variables may be missing.");
		expect(json).toMatchObject({
			options: [
				{
					id: "remote:0",
					supported: true,
					entry: { transport: "http", headers: { Authorization: "Bearer {header:TOKEN}" } },
					inputs: [{ key: "header:TOKEN", secret: true, required: true }],
				},
			],
		});
	});

	test("GitHub: a name neither registry has is a 404", async () => {
		const { fetcher } = fake({ "api.mcp.github.com": { body: { servers: [], metadata: {} } } });
		const { status } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=github&name=x%2Fy",
		);
		expect(status).toBe(404);
	});

	test("an upstream error on the detail is a 502", async () => {
		const { fetcher } = fake({ "/versions/latest": { status: 503 } });
		const { status } = await get(
			fetcher,
			"/api/settings/mcp/registry/server?source=official&name=a%2Fb",
		);
		expect(status).toBe(502);
	});

	test("a missing name is refused", async () => {
		const { fetcher } = fake({});
		const { status } = await get(fetcher, "/api/settings/mcp/registry/server?source=official");
		expect(status).toBe(400);
	});
});
