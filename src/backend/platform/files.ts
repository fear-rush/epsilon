import { dirname } from "node:path";

import { Effect, FileSystem } from "effect";
import type { Option } from "effect";

import { FileUnreadable, FileUnwritable } from "./errors.ts";

/**
 * The file helpers the rest of the backend uses. They exist so that `node:*` stays in the
 * platform layer and so that "missing" and "you may not read it" stay different answers:
 * the old tree reported EACCES as a missing file, which made a permissions problem look
 * like an empty home.
 */

/** A host error's sentence, without assuming it is an `Error` or that its reason is text. */
function describe(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null && "reason" in error) {
		const reason = error.reason;
		return typeof reason === "string" ? reason : "unknown";
	}
	return "unknown";
}

const unreadable = (path: string) => (error: unknown) =>
	new FileUnreadable({ path, reason: describe(error) });

const unwritable = (path: string) => (error: unknown) =>
	new FileUnwritable({ path, reason: describe(error) });

export const readText = (
	path: string,
): Effect.Effect<string, FileUnreadable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readFileString(path).pipe(Effect.mapError(unreadable(path)));
	});

/** `none` when the file is absent, a failure when it exists and cannot be read. */
export const readTextIfExists = (
	path: string,
): Effect.Effect<Option.Option<string>, FileUnreadable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readFileString(path).pipe(
			Effect.asSome,
			Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
			Effect.mapError(unreadable(path)),
		);
	});

export const writeText = (
	path: string,
	text: string,
): Effect.Effect<void, FileUnwritable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs
			.makeDirectory(dirname(path), { recursive: true })
			.pipe(Effect.mapError(unwritable(path)));
		yield* fs.writeFileString(path, text).pipe(Effect.mapError(unwritable(path)));
	});
