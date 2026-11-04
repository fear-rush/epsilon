import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { itEffect } from "../../../test/effect.ts";
import { testPaths } from "../../../test/setup.ts";
import { AgentHomeLive } from "../platform/agent-home.ts";
import { JsonDocumentLive } from "../platform/json-document.ts";
import { LogLive } from "../platform/log.ts";
import { EpsilonSettings, EpsilonSettingsLive } from "./epsilon.ts";

/**
 * Epsilon's own file, over the real layers and a real directory.
 *
 * The service is read before every engine spawn, so what matters is that the file is the
 * truth: a value written by another run is what the next one reads, and a file Epsilon
 * cannot use is a problem on the page, not a silent default.
 */

const settingsLayer = (name: string) => {
	const agentDir = join(testPaths.scratch, `settings-${name}`);
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

describe("epsilon settings", () => {
	itEffect(
		"an absent file means the default cap, and a write leaves unknown keys alone",
		() => {
			const { file, layer } = settingsLayer("write");
			writeFileSync(file, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`);
			return Effect.gen(function* () {
				const settings = yield* EpsilonSettings;
				expect((yield* settings.view).settings.maxRunning).toBe(8);
				yield* settings.setMaxRunning(3);
				expect(yield* settings.maxRunning).toBe(3);
				expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ maxRunning: 3, theme: "dark" });
			}).pipe(Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"a cap another run wrote is what this run reads",
		() => {
			const { file, layer } = settingsLayer("persisted");
			writeFileSync(file, `${JSON.stringify({ maxRunning: 5 }, null, 2)}\n`);
			return Effect.gen(function* () {
				const settings = yield* EpsilonSettings;
				const view = yield* settings.view;
				expect(view.settings.maxRunning).toBe(5);
				expect(view.problems).toEqual([]);
			}).pipe(Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"a file Epsilon cannot parse is a visible problem and a refused write",
		() => {
			const { file, layer } = settingsLayer("broken");
			writeFileSync(file, "{ not json");
			return Effect.gen(function* () {
				const settings = yield* EpsilonSettings;
				const view = yield* settings.view;
				expect(view.problems).toHaveLength(1);
				expect(view.problems[0]?.path).toBe(file);
				expect(view.settings.maxRunning).toBe(8);

				const refusal = yield* Effect.flip(settings.setMaxRunning(4));
				expect(refusal.key).toBe("maxRunning");
				expect(refusal.reason.length).toBeGreaterThan(0);
				// The file was not overwritten with a default; it is still what the operator left.
				expect(readFileSync(file, "utf8")).toBe("{ not json");
			}).pipe(Effect.provide(layer));
		},
		5000,
	);

	itEffect(
		"a value of the wrong shape is a problem, and the default is used",
		() => {
			const { file, layer } = settingsLayer("wrong-shape");
			writeFileSync(file, `${JSON.stringify({ maxRunning: 0 }, null, 2)}\n`);
			return Effect.gen(function* () {
				const settings = yield* EpsilonSettings;
				const view = yield* settings.view;
				expect(view.settings.maxRunning).toBe(8);
				expect(view.problems[0]?.message).toContain("maxRunning");
			}).pipe(Effect.provide(layer));
		},
		5000,
	);

	test("a cap below one is refused before the file is touched", async () => {
		const { layer } = settingsLayer("too-low");
		const refusal = await Effect.runPromise(
			Effect.gen(function* () {
				const settings = yield* EpsilonSettings;
				return yield* Effect.flip(settings.setMaxRunning(0));
			}).pipe(Effect.provide(layer)),
		);
		expect(refusal.key).toBe("maxRunning");
		expect(refusal.reason).toContain("below 1");
	});
});
