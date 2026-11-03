import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { GeneralRpcs } from "#protocol/config/general";
import { SettingRefused } from "#protocol/errors";

import { itEffect } from "../../../../test/effect.ts";
import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { JsonDocumentLive } from "../../platform/json-document.ts";
import { LogLive } from "../../platform/log.ts";
import { EpsilonSettingsLive } from "../../settings.ts";
import { GeneralHandlersLive } from "./handlers.ts";

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
	return {
		file: join(agentDir, ".epsilon", "settings.json"),
		layer: EpsilonSettingsLive.pipe(Layer.provide(platform)),
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
			"config.general.setMaxRunning",
		]);
	});
});
