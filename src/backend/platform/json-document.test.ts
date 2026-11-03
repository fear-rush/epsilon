import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Fiber, Layer } from "effect";

import { testPaths } from "../../../test/setup.ts";
import { AgentHome, makeAgentHome } from "./agent-home.ts";
import { NotJson } from "./errors.ts";
import { JsonDocument, JsonDocumentLive } from "./json-document.ts";

const home = join(testPaths.scratch, "json-document");
const settingsPath = join(home, "settings.json");

const layer = JsonDocumentLive.pipe(
	Layer.provideMerge(BunServices.layer),
	Layer.provideMerge(Layer.succeed(AgentHome, makeAgentHome(home, home))),
);

const writeInitial = (): void => {
	mkdirSync(home, { recursive: true });
	writeFileSync(
		settingsPath,
		`${JSON.stringify({ hideThinkingBlock: false, futureKey: "keep me", nested: { a: 1 } }, null, 2)}\n`,
	);
};

/** Runs pi's writer as a child process, the way a terminal pi flushes settings. */
const runPiWriter = (): Effect.Effect<{ readonly stderr: string; readonly stdout: string }> => {
	const script = new URL("./fixtures/pi-settings-writer.ts", import.meta.url).pathname;
	const child = Bun.spawn(["bun", "run", script, home], {
		env: { ...process.env, PI_CODING_AGENT_DIR: home },
		stderr: "pipe",
		stdout: "pipe",
	});
	return Effect.promise(async () => {
		const [stdout, stderr] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		await child.exited;
		return { stderr, stdout };
	});
};

describe("JsonDocument", () => {
	test("a panel write and a pi write keep both keys (F7)", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				writeInitial();
				const document = yield* JsonDocument;
				const writer = yield* Effect.forkChild(runPiWriter());
				yield* document.update(
					settingsPath,
					(current) => ({ ...current, epsilonKey: { from: "panel" } }),
					{ lock: "pi" },
				);
				const written = yield* Fiber.join(writer);
				const text = readFileSync(settingsPath, "utf8");
				return { text, written };
			}).pipe(Effect.provide(layer)),
		);

		expect(result.written.stderr).toBe("");
		expect(result.written.stdout).toContain("written");
		const written: unknown = JSON.parse(result.text);
		expect(written).toMatchObject({
			epsilonKey: { from: "panel" },
			futureKey: "keep me",
			hideThinkingBlock: true,
			nested: { a: 1 },
		});
	});

	test("refuses a file that is not JSON instead of overwriting it", async () => {
		const broken = join(home, "broken.json");
		writeFileSync(broken, "{ not json");
		const tag = await Effect.runPromise(
			Effect.gen(function* () {
				const document = yield* JsonDocument;
				return yield* Effect.match(
					document.update(broken, (current) => ({ ...current, key: 1 })),
					{
						onFailure: (error) => (error instanceof NotJson ? "NotJson" : "other"),
						onSuccess: () => "ok",
					},
				);
			}).pipe(Effect.provide(layer)),
		);
		expect(tag).toBe("NotJson");
	});
});
