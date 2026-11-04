import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Schema } from "effect";

import { McpRpcs } from "#protocol/config/mcp";
import type { McpEngineLive } from "#protocol/config/mcp";
import { McpRefused } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { JsonDocumentLive } from "../../platform/json-document.ts";
import { Log, LogLive } from "../../platform/log.ts";
import { McpHandlersLive } from "./handlers.ts";
import { mcpLiveReader } from "./live.ts";
import { makeMcpService, McpService } from "./service.ts";
import { McpStore, McpStoreLive } from "./store.ts";

/**
 * Settings → MCP over the RPC group, against real `mcp.json` files.
 *
 * The files are the subject: a save must produce an entry pi loads, keep a key the form
 * never edited, keep a stored secret, and refuse what pi would skip. The live read has no
 * engine in these tests, so it answers the empty state rather than pretending to connect.
 */

const mcpLayer = (name: string, answers: ReadonlyArray<McpEngineLive> = []) => {
	const agentDir = join(testPaths.scratch, `mcp-${name}`);
	const project = join(agentDir, "project");
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(project, { recursive: true });
	const platform = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
		Layer.provideMerge(AgentHomeLive(agentDir, testPaths.sandboxHome)),
		Layer.provideMerge(BunServices.layer),
	);
	const store = McpStoreLive.pipe(Layer.provideMerge(platform));
	const service = Layer.effect(
		McpService,
		Effect.gen(function* () {
			const mcpStore = yield* McpStore;
			const log = yield* Log;
			return makeMcpService({
				live: mcpLiveReader({
					log,
					queryAll: Effect.succeed(answers.map((result) => ({ result }))),
				}),
				store: mcpStore,
			});
		}),
	).pipe(Layer.provideMerge(store));
	return {
		agentDir,
		file: join(agentDir, "mcp.json"),
		layer: McpHandlersLive.pipe(Layer.provideMerge(service)),
		project,
		projectFile: join(project, ".pi", "mcp.json"),
	};
};

/** One `mcpServers` entry, as the test inspects what the service wrote. */
const Entry = Schema.Record(Schema.String, Schema.Json);
const Servers = Schema.Record(Schema.String, Entry);
const McpFile = Schema.Struct({
	autoEnableCodemode: Schema.optional(Schema.Json),
	mcpServers: Schema.optional(Servers),
});
type Json = Schema.Json;

const writeJson = (path: string, value: Json): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = (path: string): typeof McpFile.Type =>
	Schema.decodeUnknownSync(McpFile)(JSON.parse(readFileSync(path, "utf8")));

const serversIn = (path: string): Readonly<Record<string, Readonly<Record<string, Json>>>> =>
	readJson(path).mcpServers ?? {};

describe("config.mcp", () => {
	test("lists both files, what pi skips, and how an override relates to its global server", async () => {
		const { file, layer, project, projectFile } = mcpLayer("list");
		writeJson(file, {
			autoEnableCodemode: false,
			mcpServers: {
				broken: { url: "https://example.test/mcp", type: "sse" },
				"extra-key": { url: "https://example.test/mcp" },
				files: { args: ["-y", "server"], command: "npx" },
				"wrong-type": { command: 3 },
			},
		});
		writeJson(projectFile, {
			mcpServers: {
				"extra-key": { enabled: false, transport: "stdio" },
				files: { enabled: false },
				local: { url: "https://example.test/mcp" },
				"not a name": { command: "x" },
			},
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				return yield* client["config.mcp.list"]({ folder: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.problems).toEqual([]);
		const files = result.servers.find(
			(server) => server.name === "files" && server.scope === "global",
		);
		expect(files?.scope).toBe("global");
		expect(files?.kind).toBe("server");
		expect(files?.kind === "server" ? files.relation : undefined).toBe("overridden-by-project");
		const override = result.servers.find(
			(server) => server.kind === "override" && server.name === "files",
		);
		expect(override?.kind === "override" ? override.enabled : undefined).toBe(false);
		expect(override?.kind === "override" ? override.overrideKeys : undefined).toEqual(["enabled"]);
		expect(result.servers.find((server) => server.name === "local")?.scope).toBe("project");
		const broken = result.servers.find((server) => server.name === "broken");
		expect(broken?.kind).toBe("invalid");
		expect(broken?.kind === "invalid" ? broken.problem : "").toContain("legacy SSE");
		const wrongType = result.servers.find((server) => server.name === "wrong-type");
		expect(wrongType?.kind).toBe("invalid");
		expect(result.servers.find((server) => server.name === "not a name")?.kind).toBe("invalid");
		const extraKey = result.servers.find((server) => server.name === "extra-key");
		expect(extraKey?.kind).toBe("invalid");
		expect(extraKey?.kind === "invalid" ? extraKey.problem : "").toContain(
			"an override can only set",
		);
		// Project rows come first, then global ones by name.
		expect(result.servers[0]?.scope).toBe("project");
	});

	test("a file that is not valid JSON is a problem, and its servers are not listed", async () => {
		const { file, layer, project } = mcpLayer("broken-file");
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, '{\n  // pi parses this strictly\n  "mcpServers": {}\n}\n');

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				const list = yield* client["config.mcp.list"]({ folder: project });
				const refused = yield* Effect.flip(
					client["config.mcp.save"]({
						folder: project,
						server: {
							command: "node",
							name: "added",
							scope: "global",
							transport: "stdio",
						},
					}),
				);
				return { list, refused };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.list.servers).toEqual([]);
		expect(result.list.problems).toHaveLength(1);
		expect(result.list.problems[0]).toContain("not valid JSON");
		expect(result.refused).toBeInstanceOf(McpRefused);
		// The operator's file is untouched, not replaced with an empty document.
		expect(readFileSync(file, "utf8")).toContain("pi parses this strictly");
	});

	test("a save keeps what the dialog does not edit, and a blank env value keeps the stored secret", async () => {
		const { file, layer } = mcpLayer("save-stdio");
		writeJson(file, {
			mcpServers: {
				files: {
					args: ["old.js"],
					command: "npx",
					customKey: { keep: true },
					enabled: false,
					env: { TOKEN: "stored-secret" },
					exposure: "direct",
					type: "stdio",
				},
			},
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				yield* client["config.mcp.save"]({
					folder: null,
					server: {
						args: ["s.js"],
						command: "node",
						description: "Files",
						env: { NEW: "added", TOKEN: "" },
						exposure: "codemode",
						name: "files",
						scope: "global",
						timeout: 30,
						transport: "stdio",
					},
				});
				const detail = yield* client["config.mcp.read"]({
					folder: null,
					name: "files",
					scope: "global",
				});
				const refused = yield* Effect.flip(
					client["config.mcp.save"]({
						folder: null,
						server: {
							command: "node",
							env: { MISSING: "" },
							name: "files",
							scope: "global",
							transport: "stdio",
						},
					}),
				);
				return { detail, refused };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		const entry = serversIn(file)["files"];
		expect(entry?.["command"]).toBe("node");
		expect(entry?.["args"]).toEqual(["s.js"]);
		expect(entry?.["env"]).toEqual({ NEW: "added", TOKEN: "stored-secret" });
		expect(entry?.["customKey"]).toEqual({ keep: true });
		expect(entry?.["enabled"]).toBe(false);
		expect(entry?.["exposure"]).toBeUndefined();
		expect(entry?.["type"]).toBeUndefined();
		expect(entry?.["timeout"]).toBe(30);
		expect(result.detail.kind).toBe("server");
		expect(result.detail.kind === "server" ? result.detail.envKeys.toSorted() : []).toEqual([
			"NEW",
			"TOKEN",
		]);
		expect(JSON.stringify(result.detail)).not.toContain("stored-secret");
		expect(result.refused.reason).toContain('"MISSING"');
	});

	test("an HTTP save applies pi's rules, and the OAuth secret stays in the file", async () => {
		const { file, layer, project, projectFile } = mcpLayer("save-http");
		writeJson(file, { mcpServers: {} });
		writeJson(projectFile, { mcpServers: {} });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				const authInProject = yield* Effect.flip(
					client["config.mcp.save"]({
						folder: project,
						server: {
							authProvider: "anthropic",
							name: "docs",
							scope: "project",
							transport: "http",
							url: "https://example.test/mcp",
						},
					}),
				);
				const badUrl = yield* Effect.flip(
					client["config.mcp.save"]({
						folder: null,
						server: {
							name: "docs",
							scope: "global",
							transport: "http",
							url: "file:///tmp/socket",
						},
					}),
				);
				yield* client["config.mcp.save"]({
					folder: null,
					server: {
						headers: { Authorization: "Bearer abc" },
						name: "docs",
						oauth: {
							callbackPort: 3333,
							callbackUrl: "http://localhost:3333/callback",
							clientSecret: "shh",
							scope: "read",
						},
						scope: "global",
						transport: "http",
						url: "https://example.test/mcp",
					},
				});
				yield* client["config.mcp.save"]({
					folder: null,
					server: {
						headers: { Authorization: "Bearer abc" },
						name: "docs",
						oauth: {
							callbackPort: 3333,
							callbackUrl: "http://localhost:3333/callback",
							clientSecret: "",
							scope: "write",
						},
						scope: "global",
						transport: "http",
						url: "https://example.test/mcp",
					},
				});
				const detail = yield* client["config.mcp.read"]({
					folder: null,
					name: "docs",
					scope: "global",
				});
				const badPort = yield* Effect.flip(
					client["config.mcp.save"]({
						folder: null,
						server: {
							name: "docs",
							oauth: {
								callbackPort: 4444,
								callbackUrl: "http://localhost:3333/callback",
							},
							scope: "global",
							transport: "http",
							url: "https://example.test/mcp",
						},
					}),
				);
				return { authInProject, badPort, badUrl, detail };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.authInProject.reason).toContain("only allowed in the global");
		expect(result.badUrl.reason).toContain("http or https");
		expect(result.badPort.reason).toContain("different ports");
		expect(readJson(projectFile)).toEqual({ mcpServers: {} });
		const entry = serversIn(file)["docs"];
		expect(entry?.["headers"]).toEqual({ Authorization: "Bearer abc" });
		expect(entry?.["oauth"]).toMatchObject({
			callbackPort: 3333,
			clientSecret: "shh",
			scope: "write",
		});
		expect(result.detail.kind).toBe("server");
		expect(result.detail.kind === "server" ? result.detail.oauthClientSecret : false).toBe(true);
		expect(result.detail.kind === "server" ? result.detail.headerKeys : []).toEqual([
			"Authorization",
		]);
		expect(JSON.stringify(result.detail)).not.toContain("shh");
	});

	test("the switch writes false and removes true, and an override keeps the value it was set to", async () => {
		const { file, layer, project, projectFile } = mcpLayer("switch");
		writeJson(file, { mcpServers: { docs: { url: "https://example.test/mcp" } } });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				yield* client["config.mcp.setEnabled"]({
					enabled: false,
					folder: project,
					name: "docs",
					scope: "global",
				});
				const off = serversIn(file)["docs"];
				yield* client["config.mcp.setEnabled"]({
					enabled: true,
					folder: project,
					name: "docs",
					scope: "global",
				});
				const on = serversIn(file)["docs"];
				yield* client["config.mcp.setInProject"]({
					folder: project,
					name: "docs",
					value: "off",
				});
				yield* client["config.mcp.setEnabled"]({
					enabled: false,
					folder: project,
					name: "docs",
					scope: "project",
				});
				const overrideOff = serversIn(projectFile)["docs"];
				yield* client["config.mcp.setEnabled"]({
					enabled: true,
					folder: project,
					name: "docs",
					scope: "project",
				});
				const overrideOn = serversIn(projectFile)["docs"];
				const list = yield* client["config.mcp.list"]({ folder: project });
				yield* client["config.mcp.setInProject"]({
					folder: project,
					name: "docs",
					value: "inherit",
				});
				const inherited = serversIn(projectFile)["docs"];
				return { inherited, list, off, on, overrideOff, overrideOn };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.off?.["enabled"]).toBe(false);
		expect(result.on?.["enabled"]).toBeUndefined();
		expect(result.overrideOff?.["enabled"]).toBe(false);
		expect(result.overrideOn?.["enabled"]).toBe(true);
		expect(result.inherited).toBeUndefined();
		expect(result.list.servers.find((server) => server.kind === "override")?.enabled).toBe(true);
	});

	test("removes an entry, and refuses one that is already gone", async () => {
		const { file, layer } = mcpLayer("remove");
		writeJson(file, {
			mcpServers: {
				docs: { url: "https://example.test/mcp" },
				files: { command: "node" },
			},
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				yield* client["config.mcp.remove"]({ folder: null, name: "docs", scope: "global" });
				const gone = yield* Effect.flip(
					client["config.mcp.remove"]({ folder: null, name: "docs", scope: "global" }),
				);
				return { gone, read: yield* client["config.mcp.list"]({ folder: null }) };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(Object.keys(serversIn(file))).toEqual(["files"]);
		expect(result.gone).toBeInstanceOf(McpRefused);
		expect(result.read.servers.map((server) => server.name)).toEqual(["files"]);
	});

	test("live maps the engine's namespaced tools back to the configured server", async () => {
		const { file, layer } = mcpLayer("live", [
			{
				active: ["codemode"],
				attention: [
					{ attention: { kind: "failed", message: "connect ECONNREFUSED" }, name: "docs" },
				],
				registered: [],
				resourceTools: ["read_mcp_resource"],
				tools: [
					{
						annotations: { readOnlyHint: true },
						exposure: "direct",
						name: "mcp__files__read_file",
						namespace: "mcp__files",
					},
				],
			},
		]);
		writeJson(file, {
			mcpServers: {
				docs: { url: "https://example.test/mcp" },
				files: { command: "node" },
			},
		});

		const live = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				return yield* client["config.mcp.live"]({ folder: null });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(live.sessions).toBe(1);
		expect(live.codemode).toBe(true);
		expect(live.resourceTools).toEqual(["read_mcp_resource"]);
		const files = live.servers.find((server) => server.name === "files");
		expect(files?.tools).toEqual([
			{
				annotations: { readOnlyHint: true },
				exact: false,
				exposure: "direct",
				key: "read*file",
				name: "read_file",
			},
		]);
		expect(live.servers.find((server) => server.name === "docs")?.attention).toEqual({
			kind: "failed",
			message: "connect ECONNREFUSED",
		});
	});

	test("autoEnableCodemode: false is written, true removes the key unless the other file is off", async () => {
		const { file, layer, project, projectFile } = mcpLayer("auto-enable");
		writeJson(file, { mcpServers: {} });
		writeJson(projectFile, { mcpServers: {} });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				yield* client["config.mcp.setAutoEnableCodemode"]({
					enabled: false,
					folder: project,
					scope: "global",
				});
				const globalOff = readJson(file)["autoEnableCodemode"];
				yield* client["config.mcp.setAutoEnableCodemode"]({
					enabled: true,
					folder: project,
					scope: "global",
				});
				const globalOn = readJson(file)["autoEnableCodemode"];
				yield* client["config.mcp.setAutoEnableCodemode"]({
					enabled: false,
					folder: project,
					scope: "global",
				});
				yield* client["config.mcp.setAutoEnableCodemode"]({
					enabled: true,
					folder: project,
					scope: "project",
				});
				return { globalOff, globalOn, project: readJson(projectFile)["autoEnableCodemode"] };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.globalOff).toBe(false);
		expect(result.globalOn).toBeUndefined();
		expect(result.project).toBe(true);
	});

	test("the raw text hides stored values and puts them back", async () => {
		const { file, layer, project, projectFile } = mcpLayer("raw");
		writeJson(file, {
			mcpServers: {
				docs: {
					env: { TOKEN: "stored-env" },
					headers: { Authorization: "Bearer stored-header" },
					oauth: { clientId: "client", clientSecret: "stored-oauth" },
					url: "https://example.test/mcp",
				},
			},
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(McpRpcs, McpHandlersLive);
				const { text } = yield* client["config.mcp.readRaw"]({
					folder: null,
					name: "docs",
					scope: "global",
				});
				const edited = text.replace('"url"', '"description": "Docs",\n  "url"');
				yield* client["config.mcp.writeRaw"]({
					folder: null,
					name: "docs",
					scope: "global",
					text: edited,
				});
				const missing = yield* Effect.flip(
					client["config.mcp.writeRaw"]({
						folder: null,
						name: "fresh",
						scope: "global",
						text: '{"command":"node","env":{"A":"<stored>"}}',
					}),
				);
				const globalOverride = yield* Effect.flip(
					client["config.mcp.writeRaw"]({
						folder: null,
						name: "fresh",
						scope: "global",
						text: '{"enabled":false}',
					}),
				);
				yield* client["config.mcp.writeRaw"]({
					folder: project,
					name: "docs",
					scope: "project",
					text: '{"enabled":false}',
				});
				return { globalOverride, missing, text };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.text).toContain("<stored>");
		expect(result.text).toContain('"clientId": "client"');
		expect(result.text).not.toContain("stored-env");
		expect(result.text).not.toContain("stored-header");
		expect(result.text).not.toContain("stored-oauth");
		const entry = serversIn(file)["docs"];
		expect(entry?.["description"]).toBe("Docs");
		expect(entry?.["env"]).toEqual({ TOKEN: "stored-env" });
		expect(entry?.["headers"]).toEqual({ Authorization: "Bearer stored-header" });
		expect(entry?.["oauth"]).toEqual({ clientId: "client", clientSecret: "stored-oauth" });
		expect(result.missing.reason).toContain('"env.A"');
		expect(result.globalOverride.reason).toContain("override");
		expect(serversIn(file)["fresh"]).toBeUndefined();
		// A project entry that only changes keys is exactly what an override is.
		expect(serversIn(projectFile)["docs"]).toEqual({ enabled: false });
	});
});
