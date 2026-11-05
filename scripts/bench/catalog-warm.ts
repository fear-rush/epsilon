import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { AgentHomeLive } from "../../src/backend/platform/agent-home.ts";
import { Catalog, CatalogLive } from "../../src/backend/sessions/catalog.ts";
import { linearSession, writeSession } from "../../test/sessions.ts";
import { report } from "./lib.ts";

/**
 * The reconcile every list read pays: 500 sessions whose files have not changed, so the
 * walk only stats them. It is what a reader waits for before the sidebar appears.
 */
const rows = 500;
const root = join(tmpdir(), `epsilon-bench-warm-${process.pid}`);
const indexPath = join(tmpdir(), `epsilon-bench-warm-${process.pid}.sqlite`);
rmSync(root, { force: true, recursive: true });
rmSync(indexPath, { force: true });
for (let index = 0; index < rows; index++) {
	writeSession(
		join(root, "sessions", "--bench--"),
		`s-${index}`,
		linearSession(`s-${index}`, "/tmp/bench", 40),
	);
}

const catalog = CatalogLive(indexPath, {
	formatVersion: 3,
	piVersion: "1.4.0",
	schemaVersion: "1",
}).pipe(Layer.provideMerge(AgentHomeLive(root, root)), Layer.provideMerge(BunServices.layer));

const warm = await Effect.runPromise(
	Effect.gen(function* () {
		const service = yield* Catalog;
		yield* service.sync([join(root, "sessions")]);
		const started = Date.now();
		yield* service.sync([join(root, "sessions")]);
		return Date.now() - started;
	}).pipe(Effect.provide(catalog)),
);

rmSync(root, { force: true, recursive: true });
rmSync(indexPath, { force: true });
await report("catalog-warm", "ms", warm);
