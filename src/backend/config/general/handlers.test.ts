import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Schema } from "effect";

import { GeneralRpcs } from "#protocol/config/general";
import { SettingRefused } from "#protocol/errors";

import { writeStubModels } from "../../../../test/e2e/stub-model.ts";
import { itEffect } from "../../../../test/effect.ts";
import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { JsonDocumentLive } from "../../platform/json-document.ts";
import { LogLive } from "../../platform/log.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { EpsilonSettingsLive } from "../../settings.ts";
import { GeneralHandlersLive } from "./handlers.ts";
import { GeneralStoreLive } from "./store.ts";

/**
 * Settings → General over the RPC group, through the real client and server machinery.
 *
 * The service test proves the file; this one proves the wire: the payload decodes, the
 * success value is the schema's, and a refusal arrives as `SettingRefused` rather than a
 * generic failure.
 */

const handlersLayer = (name: string) => {
	const agentDir = join(testPaths.scratch, `general-${name}`);
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	const platform = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
		Layer.provideMerge(AgentHomeLive(agentDir, testPaths.sandboxHome)),
		Layer.provideMerge(BunServices.layer),
	);
	const config = PiConfigLive.pipe(Layer.provideMerge(platform));
	return {
		agentDir,
		file: join(agentDir, ".epsilon", "settings.json"),
		layer: Layer.mergeAll(
			EpsilonSettingsLive.pipe(Layer.provideMerge(platform)),
			GeneralStoreLive.pipe(Layer.provideMerge(config)),
		),
	};
};

describe("config.general", () => {
	itEffect(
		"reads the cap and returns the written one",
		() => {
			const { layer } = handlersLayer("read-write");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				const before = yield* client["config.general.read"]();
				expect(before.settings.maxRunning).toBe(8);
				expect(before.problems).toEqual([]);

				yield* client["config.general.setMaxRunning"]({ maxRunning: 2 });
				const after = yield* client["config.general.read"]();
				expect(after.settings.maxRunning).toBe(2);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"a refused write is the tagged error the client can show",
		() => {
			const { layer } = handlersLayer("refused");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				const error = yield* Effect.flip(client["config.general.setMaxRunning"]({ maxRunning: 0 }));
				expect(error).toBeInstanceOf(SettingRefused);
				expect(error.key).toBe("maxRunning");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	test("the group's tags are the ones the page will call", () => {
		expect([...GeneralRpcs.requests.keys()].toSorted()).toEqual([
			"config.general.read",
			"config.general.setDefaultModel",
			"config.general.setMaxRunning",
			"config.general.settings",
			"config.general.writeSetting",
		]);
	});
});

const SettingsFile = Schema.Record(Schema.String, Schema.Json);

/** The file as JSON, decoded by the same schema language the server uses. */
const readFile = (path: string) =>
	Schema.decodeUnknownSync(SettingsFile)(JSON.parse(readFileSync(path, "utf8")));

describe("config.general pi settings", () => {
	itEffect(
		"reads pi's file as the layers it was loaded from",
		() => {
			const { agentDir, layer } = handlersLayer("pi-read");
			writeFileSync(
				join(agentDir, "settings.json"),
				`${JSON.stringify({ compaction: { enabled: false }, steeringMode: "all" }, null, 2)}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				const view = yield* client["config.general.settings"]({ folder: null });
				const row = (key: string) => view.rows.find((candidate) => candidate.key === key);
				expect(row("steeringMode")?.value).toBe("all");
				expect(row("steeringMode")?.scope).toBe("global");
				expect(row("compaction.enabled")?.value).toBe(false);
				// A key no file sets reports pi's default and says so.
				expect(row("treeFilterMode")?.scope).toBe("default");
				expect(view.problems).toEqual([]);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"writes a key pi has a setter for, and pi reads it back",
		() => {
			const { agentDir, layer } = handlersLayer("pi-write");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				yield* client["config.general.writeSetting"]({ key: "hideThinkingBlock", value: true });
				expect(readFile(join(agentDir, "settings.json"))["hideThinkingBlock"]).toBe(true);
				const view = yield* client["config.general.settings"]({ folder: null });
				const row = view.rows.find((candidate) => candidate.key === "hideThinkingBlock");
				expect(row?.value).toBe(true);
				expect(row?.scope).toBe("global");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"merges a key pi only reads, keeping the file's unknown keys",
		() => {
			const { agentDir, layer } = handlersLayer("pi-merge");
			writeFileSync(
				join(agentDir, "settings.json"),
				`${JSON.stringify({ compaction: { enabled: true }, custom: { keep: 1 } }, null, 2)}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				yield* client["config.general.writeSetting"]({
					key: "compaction.reserveTokens",
					value: 4096,
				});
				const file = readFile(join(agentDir, "settings.json"));
				expect(file["custom"]).toEqual({ keep: 1 });
				expect(file["compaction"]).toEqual({ enabled: true, reserveTokens: 4096 });
				const view = yield* client["config.general.settings"]({ folder: null });
				const row = view.rows.find((candidate) => candidate.key === "compaction.reserveTokens");
				expect(row?.value).toBe(4096);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"refuses an unknown key and a value of the wrong shape",
		() => {
			const { layer } = handlersLayer("pi-refused");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				const unknown = yield* Effect.flip(
					client["config.general.writeSetting"]({ key: "theme", value: "dark" }),
				);
				expect(unknown).toBeInstanceOf(SettingRefused);
				const wrong = yield* Effect.flip(
					client["config.general.writeSetting"]({ key: "hideThinkingBlock", value: "yes" }),
				);
				expect(wrong.reason).toContain("true or false");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"a settings.json pi cannot load is a problem, and a write names it",
		() => {
			const { agentDir, layer } = handlersLayer("pi-broken");
			writeFileSync(join(agentDir, "settings.json"), "{ not json");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				const view = yield* client["config.general.settings"]({ folder: null });
				expect(view.problems.length).toBeGreaterThan(0);
				expect(view.problems[0]?.path).toBe(join(agentDir, "settings.json"));
				const refusal = yield* Effect.flip(
					client["config.general.writeSetting"]({ key: "hideThinkingBlock", value: true }),
				);
				expect(refusal.reason).toContain("could not load");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"sets the default model only to a model pi composed",
		() => {
			const { agentDir, layer } = handlersLayer("pi-default-model");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(GeneralRpcs, GeneralHandlersLive);
				yield* client["config.general.setDefaultModel"]({
					modelId: "stub-model",
					provider: "stub",
				});
				const file = readFile(join(agentDir, "settings.json"));
				expect(file["defaultModel"]).toBe("stub-model");
				expect(file["defaultProvider"]).toBe("stub");
				const view = yield* client["config.general.settings"]({ folder: null });
				expect(view.defaultModel).toEqual({ modelId: "stub-model", provider: "stub" });

				const unknown = yield* Effect.flip(
					client["config.general.setDefaultModel"]({
						modelId: "missing",
						provider: "stub",
					}),
				);
				expect(unknown.reason).toContain("does not know");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		10000,
	);
});
