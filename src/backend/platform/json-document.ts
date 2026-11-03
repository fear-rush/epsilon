import { resolve } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, RcMap, Semaphore } from "effect";
import lockfile from "proper-lockfile";

import { FileUnreadable, Locked, NotJson } from "./errors.ts";
import type { FileUnwritable } from "./errors.ts";
import { writeText } from "./files.ts";
import { isJsonObject, mergeDeep } from "./patch.ts";

/**
 * Read-modify-write for pi's JSON files, safe against the other writers on this machine.
 *
 * Two locks, because they stop different things:
 *
 * - A semaphore keyed by the file's real path serializes this process's own writes, so two
 *   panels editing one file cannot interleave a read and a write.
 * - pi's own `proper-lockfile` lock (same options pi uses: `realpath: false`, ten tries,
 *   20 ms apart) serializes against pi itself, a terminal, and a live engine flushing
 *   `settings.json`. Without it, one of the two writes is lost.
 *
 * The document is merged, never replaced: a key Epsilon does not understand survives,
 * including one a newer pi added. A file that does not parse is refused, not overwritten.
 */

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type UpdateOptions = {
	/** Take pi's lockfile too. Required for `settings.json`, which pi and engines write. */
	readonly lock?: "pi" | undefined;
};

export type JsonDocumentApi = {
	readonly read: (path: string) => Effect.Effect<JsonObject, FileUnreadable | NotJson>;
	readonly update: (
		path: string,
		change: (current: JsonObject) => JsonObject,
		options?: UpdateOptions,
	) => Effect.Effect<JsonObject, FileUnreadable | FileUnwritable | NotJson | Locked>;
	/**
	 * Replaces the document. A merge cannot delete a key, so a feature that removes one
	 * (a provider, a server) builds the next document and writes it whole; the file is
	 * still parsed first, so an unreadable one is refused rather than overwritten.
	 */
	readonly write: (
		path: string,
		document: JsonObject,
		options?: UpdateOptions,
	) => Effect.Effect<JsonObject, FileUnreadable | FileUnwritable | NotJson | Locked>;
};

export class JsonDocument extends Context.Service<JsonDocument, JsonDocumentApi>()(
	"epsilon/JsonDocument",
) {}

const parseDocument = (
	path: string,
	text: string | undefined,
): Effect.Effect<JsonObject, NotJson> => {
	if (text === undefined || text.trim() === "") return Effect.succeed({});
	return Effect.try({
		try: () => {
			const parsed: unknown = JSON.parse(text);
			if (!isJsonObject(parsed)) throw new Error("the document is not a JSON object");
			return parsed;
		},
		catch: (error) =>
			new NotJson({ path, reason: error instanceof Error ? error.message : String(error) }),
	});
};

/** pi's lock, taken the way pi takes it, and released even when the write fails. */
const withPiLock = <A, E, R>(
	path: string,
	effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Locked, R> =>
	Effect.acquireUseRelease(
		Effect.tryPromise({
			try: () =>
				lockfile.lock(path, {
					realpath: false,
					retries: { factor: 1, maxTimeout: 20, minTimeout: 20, retries: 10 },
				}),
			catch: () => new Locked({ path }),
		}),
		() => effect,
		(release) => Effect.tryPromise(() => release()).pipe(Effect.ignore),
	);

export const JsonDocumentLive = Layer.effect(
	JsonDocument,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const locks = yield* RcMap.make({
			idleTimeToLive: "1 minute",
			lookup: () => Semaphore.make(1),
		});

		const fileKey = (path: string): Effect.Effect<string> =>
			fs.realPath(path).pipe(Effect.orElseSucceed(() => resolve(path)));

		const read = (path: string): Effect.Effect<JsonObject, FileUnreadable | NotJson> =>
			Effect.gen(function* () {
				const found = yield* fs.readFileString(path).pipe(
					Effect.asSome,
					Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
					Effect.mapError(
						(error) =>
							new FileUnreadable({
								path,
								reason: error instanceof Error ? error.message : String(error),
							}),
					),
				);
				return yield* parseDocument(path, Option.getOrUndefined(found));
			}).pipe(Effect.provideService(FileSystem.FileSystem, fs));

		const update: JsonDocumentApi["update"] = (path, change, options) =>
			Effect.gen(function* () {
				const key = yield* fileKey(path);
				const semaphore = yield* RcMap.get(locks, key);
				const write = (): Effect.Effect<JsonObject, FileUnreadable | FileUnwritable | NotJson> =>
					Effect.gen(function* () {
						const current = yield* read(path);
						const next = mergeDeep(current, change(current));
						// SAFETY: both arguments are JsonObject, so the merge returns one.
						yield* writeText(path, `${JSON.stringify(next, null, 2)}\n`).pipe(
							Effect.provideService(FileSystem.FileSystem, fs),
						);
						return next;
					});
				return yield* semaphore.withPermits(1)(
					options?.lock === "pi" ? withPiLock(path, write()) : write(),
				);
			}).pipe(Effect.scoped);

		const replace: JsonDocumentApi["write"] = (path, document, options) =>
			Effect.gen(function* () {
				const key = yield* fileKey(path);
				const semaphore = yield* RcMap.get(locks, key);
				const write = (): Effect.Effect<JsonObject, FileUnreadable | FileUnwritable | NotJson> =>
					Effect.gen(function* () {
						yield* read(path);
						yield* writeText(path, `${JSON.stringify(document, null, 2)}\n`).pipe(
							Effect.provideService(FileSystem.FileSystem, fs),
						);
						return document;
					});
				return yield* semaphore.withPermits(1)(
					options?.lock === "pi" ? withPiLock(path, write()) : write(),
				);
			}).pipe(Effect.scoped);

		return { read, update, write: replace };
	}),
);
