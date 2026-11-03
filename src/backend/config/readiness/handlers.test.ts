import { describe, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { ReadinessRpcs } from "#protocol/config/readiness";

import { writeStubModels } from "../../../../test/e2e/stub-model.ts";
import { itEffect } from "../../../../test/effect.ts";
import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { JsonDocumentLive } from "../../platform/json-document.ts";
import { LogLive } from "../../platform/log.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { ProvidersStoreLive } from "../providers/store.ts";
import { ReadinessHandlersLive } from "./handlers.ts";
import { ReadinessServiceLive } from "./service.ts";

/**
 * The readiness answer, over the RPC group, from pi's own runtime on a real home.
 *
 * The notice in the page is only as good as this answer, so the three states are tested on
 * the files that produce them: nothing configured, a configured provider with a model, and
 * a `models.json` pi cannot compose.
 */

const readinessLayer = (name: string) => {
	const agentDir = join(testPaths.scratch, `readiness-${name}`);
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	const platform = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
		Layer.provideMerge(AgentHomeLive(agentDir, testPaths.sandboxHome)),
		Layer.provideMerge(BunServices.layer),
	);
	const config = PiConfigLive.pipe(Layer.provideMerge(platform));
	const store = ProvidersStoreLive.pipe(Layer.provideMerge(platform));
	return {
		agentDir,
		layer: Layer.mergeAll(
			ReadinessServiceLive.pipe(
				Layer.provideMerge(platform),
				Layer.provideMerge(config),
				Layer.provideMerge(store),
			),
		),
	};
};

describe("config.readiness", () => {
	itEffect(
		"an empty home is not ready, with the step that fixes it",
		() => {
			const { layer } = readinessLayer("empty");
			return Effect.gen(function* () {
				const client = yield* testClient(ReadinessRpcs, ReadinessHandlersLive);
				const answer = yield* client["config.readiness.read"]();
				expect(answer.ready).toBe(false);
				if (answer.ready) return;
				expect(answer.status).toBe("not_ready");
				expect(answer.detail).toContain("No provider");
				expect(answer.fix).toContain("Settings");
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"a configured provider with a model is ready",
		() => {
			const { agentDir, layer } = readinessLayer("ready");
			writeStubModels(agentDir, "http://127.0.0.1:1");
			return Effect.gen(function* () {
				const client = yield* testClient(ReadinessRpcs, ReadinessHandlersLive);
				const answer = yield* client["config.readiness.read"]();
				expect(answer).toEqual({ ready: true });
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);

	itEffect(
		"a models.json pi cannot compose is invalid, and pi's sentence names it",
		() => {
			const { agentDir, layer } = readinessLayer("invalid");
			writeFileSync(
				join(agentDir, "models.json"),
				`${JSON.stringify({ providers: { broken: { api: "nope", models: [{ id: "m" }] } } }, null, 2)}\n`,
			);
			return Effect.gen(function* () {
				const client = yield* testClient(ReadinessRpcs, ReadinessHandlersLive);
				const answer = yield* client["config.readiness.read"]();
				expect(answer.ready).toBe(false);
				if (answer.ready) return;
				expect(answer.status).toBe("invalid");
				expect(answer.detail.length).toBeGreaterThan(0);
			}).pipe(Effect.scoped, Effect.provide(layer));
		},
		15000,
	);
});
