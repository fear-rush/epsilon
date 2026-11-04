import { describe, expect, test } from "bun:test";

import { Effect, Layer } from "effect";
import type { Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { RegistryNotFound, RegistryUnavailable } from "#protocol/errors";
import { McpRegistryRpcs } from "#protocol/settings/mcp-registry";

import { testClient } from "../../../../test/rpc.ts";
import { McpRegistryHandlersLive } from "./handlers.ts";
import { makeMcpRegistryService, McpRegistryService } from "./service.ts";

/**
 * Settings → MCP → Registry over the RPC group, against a real local HTTP server.
 *
 * The service points its two base URLs at the server, so the test exercises the real
 * `HttpClient`, URL building, status handling and decoding. No network and no mock fetch.
 */

type Reply = (url: URL) => Response;
type Routes = Record<string, Reply>;

const json =
	(body: Schema.Json): Reply =>
	() =>
		Response.json(body);

const withServer = async <A>(
	routes: Routes,
	body: (origin: string, requests: ReadonlyArray<URL>) => Promise<A>,
): Promise<A> => {
	const requests: URL[] = [];
	const server = Bun.serve({
		fetch(request) {
			const url = new URL(request.url);
			requests.push(url);
			const route = routes[decodeURIComponent(url.pathname)];
			return route === undefined ? new Response("not found", { status: 404 }) : route(url);
		},
		port: 0,
	});
	try {
		return await body(server.url.origin, requests);
	} finally {
		await server.stop(true);
	}
};

const registryLayer = (origin: string) => {
	const service = Layer.effect(
		McpRegistryService,
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient;
			return makeMcpRegistryService({ client, githubBase: origin, officialBase: origin });
		}),
	).pipe(Layer.provideMerge(FetchHttpClient.layer));
	return McpRegistryHandlersLive.pipe(Layer.provideMerge(service));
};

const officialList = {
	servers: [
		{
			server: {
				name: "io.example/fetch",
				description: "Fetch pages",
				version: "1.0.0",
				repository: { url: "https://github.com/example/fetch" },
				packages: [
					{
						registryType: "npm",
						identifier: "fetch-mcp",
						version: "1.0.0",
					},
				],
			},
		},
	],
	metadata: { nextCursor: "next-1" },
};

const officialDetail = {
	server: {
		name: "io.example/files",
		description: "File tools",
		title: "Files server",
		version: "2.0.0",
		repository: { url: "https://github.com/example/files" },
		packages: [
			{
				registryType: "npm",
				identifier: "@scope/files",
				version: "2.0.0",
				transport: { type: "stdio" },
				environmentVariables: [
					{
						name: "API_KEY",
						description: "The key",
						isRequired: true,
						isSecret: true,
					},
					{ name: "OPTIONAL_TOKEN", isSecret: true },
				],
				runtimeArguments: [{ type: "named", name: "--registry", value: "https://r.example" }],
				packageArguments: [{ type: "positional", value: "serve" }],
			},
			{ registryType: "nuget", identifier: "Files", version: "1.0.0" },
			{
				registryType: "oci",
				identifier: "ghcr.io/example/files",
				version: "3.0.0",
				environmentVariables: [{ name: "TOKEN", isRequired: true }],
			},
		],
		remotes: [
			{
				type: "streamable-http",
				url: "https://files.example/mcp/{token}",
				headers: [{ name: "X-Org", isRequired: true }],
			},
			{ type: "sse", url: "https://legacy.example/sse" },
		],
	},
};

const githubList = {
	servers: [
		{
			server: {
				name: "io.github.owner/server",
				description: "GitHub's server",
				version_detail: { version: "1.2.3" },
				repository: { url: "https://github.com/owner/server" },
				packages: [
					{
						name: "@owner/server",
						version: "1.2.3",
						runtime_hint: "uvx",
						environment_variables: [{ name: "TOKEN", is_required: true, is_secret: true }],
					},
				],
			},
		},
	],
};

describe("settings.mcpRegistry", () => {
	test("searching the official registry maps a page and its cursor", async () => {
		await withServer(
			{
				"/v0/servers": json(officialList),
			},
			async (origin, requests) => {
				const view = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						return yield* client["settings.mcpRegistry.search"]({
							cursor: "abc",
							q: "fetch",
							source: "official",
						});
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);

				const request = requests[0];
				expect(request?.pathname).toBe("/v0/servers");
				expect(Object.fromEntries(request?.searchParams ?? [])).toEqual({
					cursor: "abc",
					limit: "20",
					search: "fetch",
					version: "latest",
				});
				expect(view).toEqual({
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
					nextCursor: "next-1",
				});
			},
		);
	});

	test("a 404 under /v0 tries the next official prefix", async () => {
		await withServer(
			{
				"/v0.1/servers": json(officialList),
			},
			async (origin, requests) => {
				const view = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						return yield* client["settings.mcpRegistry.search"]({ source: "official" });
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);
				expect(requests.map((request) => request.pathname)).toEqual([
					"/v0/servers",
					"/v0.1/servers",
				]);
				expect(view.items).toHaveLength(1);
			},
		);
	});

	test("a server's options are mcp.json entries with placeholders for the values a person supplies", async () => {
		await withServer(
			{
				"/v0/servers/io.example/files/versions/latest": json(officialDetail),
			},
			async (origin) => {
				const detail = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						return yield* client["settings.mcpRegistry.read"]({
							name: "io.example/files",
							source: "official",
						});
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);

				expect(detail.title).toBe("Files server");
				expect(detail.options.map((option) => option.id)).toEqual([
					"package:0",
					"package:1",
					"package:2",
					"remote:0",
					"remote:1",
				]);
				const npm = detail.options[0];
				expect(npm?.supported).toBe(true);
				expect(npm?.entry).toEqual({
					transport: "stdio",
					command: "npx",
					args: ["-y", "--registry", "https://r.example", "@scope/files@2.0.0", "serve"],
					env: { API_KEY: "{env:API_KEY}", OPTIONAL_TOKEN: "{env:OPTIONAL_TOKEN}" },
				});
				expect(npm?.inputs).toEqual([
					{
						key: "env:API_KEY",
						target: "env",
						name: "API_KEY",
						description: "The key",
						required: true,
						secret: true,
					},
					{
						key: "env:OPTIONAL_TOKEN",
						target: "env",
						name: "OPTIONAL_TOKEN",
						required: false,
						secret: true,
					},
				]);
				expect(detail.options[1]?.supported).toBe(false);
				expect(detail.options[1]?.reason).toContain("NuGet");
				expect(detail.options[2]?.entry).toEqual({
					transport: "stdio",
					command: "docker",
					args: ["run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/example/files:3.0.0"],
					env: { TOKEN: "{env:TOKEN}" },
				});
				const remote = detail.options[3];
				expect(remote?.entry).toEqual({
					transport: "http",
					url: "https://files.example/mcp/{url:token}",
					headers: { "X-Org": "{header:X-Org}" },
				});
				expect(remote?.inputs.map((input) => input.key)).toEqual(["url:token", "header:X-Org"]);
				expect(detail.options[4]?.supported).toBe(false);
				expect(detail.options[4]?.reason).toContain("legacy SSE");
			},
		);
	});

	test("GitHub's detail falls back to its list and says what the data lacks", async () => {
		await withServer(
			{
				"/v0/servers": json(githubList),
			},
			async (origin) => {
				const detail = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						return yield* client["settings.mcpRegistry.read"]({
							name: "io.github.owner/server",
							source: "github",
						});
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);

				expect(detail.note).toContain("GitHub's registry");
				expect(detail.options[0]?.entry).toEqual({
					transport: "stdio",
					command: "uvx",
					args: ["@owner/server==1.2.3"],
					env: { TOKEN: "{env:TOKEN}" },
				});
				expect(detail.options[0]?.inputs.map((input) => input.key)).toEqual(["env:TOKEN"]);
			},
		);
	});

	test("an official server that is not there is not found; a broken answer is unavailable", async () => {
		await withServer(
			{
				"/v0/servers": () => new Response("nope", { status: 500 }),
			},
			async (origin) => {
				const result = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						const notFound = yield* Effect.flip(
							client["settings.mcpRegistry.read"]({
								name: "io.example/missing",
								source: "official",
							}),
						);
						const unavailable = yield* Effect.flip(
							client["settings.mcpRegistry.search"]({ source: "official" }),
						);
						return { notFound, unavailable };
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);
				expect(result.notFound).toBeInstanceOf(RegistryNotFound);
				expect(result.notFound).toMatchObject({
					_tag: "RegistryNotFound",
					server: "io.example/missing",
				});
				expect(result.unavailable).toBeInstanceOf(RegistryUnavailable);
				expect(result.unavailable).toMatchObject({
					reason: expect.stringContaining("answered 500"),
				});
			},
		);
	});

	test("an answer this version cannot read is unavailable, not a crash", async () => {
		await withServer(
			{
				"/v0/servers": () => new Response("not json", { status: 200 }),
			},
			async (origin) => {
				const failure = await Effect.runPromise(
					Effect.gen(function* () {
						const client = yield* testClient(McpRegistryRpcs, McpRegistryHandlersLive);
						return yield* Effect.flip(
							client["settings.mcpRegistry.search"]({ source: "official" }),
						);
					}).pipe(Effect.scoped, Effect.provide(registryLayer(origin))),
				);
				expect(failure).toBeInstanceOf(RegistryUnavailable);
				expect(failure.reason).toContain("cannot read");
			},
		);
	});
});
