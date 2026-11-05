import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { BunServices } from "@effect/platform-bun";
import { Deferred, Effect, Layer, Option, Ref, Stream } from "effect";

const runEffect = Effect.runPromise;

import {
	branchedSession,
	compactedSession,
	halfWrittenSession,
	linearSession,
	renamedSession,
	rewrittenHeadSession,
	writeSession,
} from "../../../test/sessions.ts";
import { testPaths } from "../../../test/setup.ts";
import { Catalog, CatalogLive, makeCatalog } from "./catalog.ts";

/**
 * The conformance test: the index must agree with pi's own `listAll` on every field the
 * session list shows. This is also what guards pi upgrades (docs/pi-sdk.md, Upgrading pi): when pi's
 * rules move, this test fails before a chat disappears from the sidebar.
 */

const root = join(testPaths.agentHome, "sessions");
const projectDir = join(root, "--tmp-project--");
const indexPath = join(testPaths.scratch, "catalog", "index.sqlite");

const meta = { formatVersion: 3, piVersion: "1.4.0", schemaVersion: "1" };
const catalogLayer = Layer.provideMerge(CatalogLive(indexPath, meta), BunServices.layer);

const fixtures = (): void => {
	rmSync(root, { recursive: true, force: true });
	mkdirSync(projectDir, { recursive: true });
	writeSession(projectDir, "s-linear", linearSession("s-linear", "/tmp/project", 9));
	writeSession(projectDir, "s-branch", branchedSession("s-branch", "/tmp/project"));
	writeSession(projectDir, "s-compact", compactedSession("s-compact", "/tmp/project"));
	writeSession(
		projectDir,
		"s-renamed",
		renamedSession("s-renamed", "/tmp/project", "Renamed chat"),
	);
	writeSession(projectDir, "s-half", halfWrittenSession("s-half", "/tmp/project"));
	writeSession(projectDir, "s-rewritten", rewrittenHeadSession("s-rewritten", "/tmp/project"));
};

/** pi names a session file `<timestamp>_<id>.jsonl`; find it by its id. */
const fileFor = (sessionId: string): string => {
	const match = readdirSync(projectDir).find((file) => file.endsWith(`_${sessionId}.jsonl`));
	if (match === undefined) throw new Error(`no file for ${sessionId}`);
	return join(projectDir, match);
};

const piList = async () => {
	const sessions = await SessionManager.listAll();
	return sessions.map((session) => ({
		cwd: session.cwd,
		created: session.created.getTime(),
		firstMessage: session.firstMessage,
		id: session.id,
		messageCount: session.messageCount,
		modified: session.modified.getTime(),
		name: session.name ?? null,
	}));
};

const ours = (
	rows: ReadonlyArray<{
		cwd: string;
		created: number;
		firstMessage: string;
		id: string;
		messageCount: number;
		lastActivity: number;
		name: string | undefined;
	}>,
) =>
	rows
		.map((row) => ({
			cwd: row.cwd,
			created: row.created,
			firstMessage: row.firstMessage,
			id: row.id,
			messageCount: row.messageCount,
			modified: row.lastActivity,
			name: row.name ?? null,
		}))
		.toSorted((left, right) => left.id.localeCompare(right.id));

const byId = <T extends { id: string }>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
	values.toSorted((left, right) => left.id.localeCompare(right.id));

describe("catalog conformance", () => {
	test("agrees with SessionManager.listAll, field by field", async () => {
		fixtures();
		const [rows, expected] = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				yield* catalog.sync([root]);
				return [yield* catalog.list, null] as const;
			}).pipe(Effect.provide(catalogLayer)),
		).then(async (result) => [result[0], await piList()] as const);

		expect(compareFields(ours(rows), byId(expected))).toEqual([]);
		expect(rows).toHaveLength(expected.length);
	});

	test("an appended turn is picked up without a full re-parse", async () => {
		const file = fileFor("s-linear");
		const before = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				const rows = yield* catalog.list;
				return rows.find((row) => row.id === "s-linear");
			}).pipe(Effect.provide(catalogLayer)),
		);
		if (before === undefined) throw new Error("s-linear is not indexed");

		appendFileSync(
			file,
			`${JSON.stringify({
				id: "e-extra",
				message: { content: [{ text: "one more", type: "text" }], role: "user" },
				parentId: "e000008",
				timestamp: "2026-01-02T00:00:00.000Z",
				type: "message",
			})}\n`,
		);

		const after = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				const result = yield* catalog.sync([root]);
				const rows = yield* catalog.list;
				return { result, row: rows.find((row) => row.id === "s-linear") };
			}).pipe(Effect.provide(catalogLayer)),
		);
		expect(after.result.updated).toBe(1);
		expect(after.row?.messageCount).toBe(before.messageCount + 1);
	});

	test("a deleted file loses its rows", async () => {
		rmSync(fileFor("s-branch"));
		const result = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				const sync = yield* catalog.sync([root]);
				return { rows: yield* catalog.list, sync };
			}).pipe(Effect.provide(catalogLayer)),
		);
		expect(result.sync.removed).toBe(1);
		expect(result.rows.some((row) => row.id === "s-branch")).toBe(false);
	});

	test("a schema change rebuilds instead of trusting the old rows", async () => {
		const rebuilt = Layer.provide(
			CatalogLive(indexPath, { ...meta, piVersion: "9.9.9" }),
			BunServices.layer,
		);
		const rows = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				return yield* catalog.list;
			}).pipe(Effect.provide(rebuilt)),
		);
		expect(rows).toHaveLength(0);
	});

	test("the index can be deleted and rebuilt from the files", async () => {
		rmSync(indexPath, { force: true });
		rmSync(`${indexPath}-wal`, { force: true });
		rmSync(`${indexPath}-shm`, { force: true });
		const rows = await runEffect(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				yield* catalog.sync([root]);
				return yield* catalog.list;
			}).pipe(Effect.provide(catalogLayer)),
		);
		expect(rows.length).toBeGreaterThan(0);
	});
});

const fields: ReadonlyArray<keyof Row> = [
	"cwd",
	"created",
	"firstMessage",
	"id",
	"messageCount",
	"modified",
	"name",
];

/** Every field mismatch, so a failure names the session and the field. */
function compareFields(
	actual: ReadonlyArray<Row>,
	expected: ReadonlyArray<Row>,
): ReadonlyArray<string> {
	const mismatches: string[] = [];
	if (actual.length !== expected.length) {
		mismatches.push(`row count ${actual.length} !== ${expected.length}`);
	}
	for (const [index, row] of expected.entries()) {
		const other = actual[index];
		if (other === undefined) {
			mismatches.push(`${row.id}: missing`);
			continue;
		}
		for (const key of fields) {
			if (other[key] !== row[key]) {
				mismatches.push(`${row.id}.${key}: ${String(other[key])} !== ${String(row[key])}`);
			}
		}
	}
	return mismatches;
}

type Row = {
	readonly cwd: string;
	readonly created: number;
	readonly firstMessage: string;
	readonly id: string;
	readonly messageCount: number;
	readonly modified: number;
	readonly name: string | null;
};

/** Keeps `makeCatalog` imported so the test also covers the direct constructor. */
test("makeCatalog builds on an existing connection", () => {
	const db = new Database(":memory:");
	const catalog = makeCatalog(db);
	expect(catalog).toBeDefined();
	db.close();
});

test("the watcher publishes a version after a file changes", async () => {
	const directory = join(testPaths.scratch, "catalog-watch", "--project--");
	mkdirSync(directory, { recursive: true });
	const file = join(directory, "2026-01-01_s-watch.jsonl");
	writeFileSync(file, linearSession("s-watch", directory, 3));
	const version = await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				yield* catalog.sync([directory]);
				yield* catalog.watch([directory]);
				const first = yield* Deferred.make<number>();
				yield* Effect.forkScoped(
					catalog.changes.pipe(
						Stream.take(1),
						Stream.runHead,
						Effect.flatMap((value) =>
							Option.isSome(value) ? Deferred.succeed(first, value.value) : Effect.void,
						),
					),
				);
				yield* Effect.sleep("20 millis");
				appendFileSync(
					file,
					`${JSON.stringify({
						id: "appended",
						message: { content: [{ text: "after the watch", type: "text" }], role: "user" },
						parentId: "e000002",
						timestamp: "2026-01-01T00:01:00.000Z",
						type: "message",
					})}\n`,
				);
				return yield* Deferred.await(first).pipe(
					Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.succeed(0) }),
				);
			}).pipe(Effect.provide(catalogLayer)),
		),
	);
	expect(version).toBeGreaterThan(0);
}, 10_000);

/**
 * A cold build on the operator's real home holds the runtime for 14.7 s. Effect does not
 * preempt synchronous work, so before the loop handed control back between slices, no
 * other fiber — the socket's handlers included — could run at all until it finished.
 */
test("a long reconcile lets other work run between slices", async () => {
	rmSync(root, { recursive: true, force: true });
	mkdirSync(projectDir, { recursive: true });
	// Enough files that the build takes real time: 40 sessions of 60 entries.
	for (let index = 0; index < 40; index++) {
		writeSession(
			projectDir,
			`s-slice-${index}`,
			linearSession(`s-slice-${index}`, "/tmp/project", 60),
		);
	}

	const ticks = await runEffect(
		Effect.scoped(
			Effect.gen(function* () {
				const catalog = yield* Catalog;
				const count = yield* Ref.make(0);
				// A fiber that asks to run again after every turn: it only advances while
				// the sync is handing control back.
				yield* Effect.forkScoped(
					Effect.forever(
						Effect.andThen(
							Effect.yieldNow,
							Ref.update(count, (n) => n + 1),
						),
					),
				);
				const result = yield* catalog.sync([root]);
				expect(result.added).toBeGreaterThanOrEqual(40);
				return yield* Ref.get(count);
			}),
		).pipe(Effect.provide(catalogLayer)),
	);

	expect(ticks).toBeGreaterThan(0);
});
