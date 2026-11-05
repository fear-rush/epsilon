import {
	closeSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmdirSync,
	statSync,
} from "node:fs";
import { open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Effect, FileSystem } from "effect";
import type { Option } from "effect";

import { FileTooLarge, FileUnreadable, FileUnwritable } from "./errors.ts";

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

export const appendText = (
	path: string,
	text: string,
): Effect.Effect<void, FileUnwritable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.writeFileString(path, text, { flag: "a" }).pipe(Effect.mapError(unwritable(path)));
	});

export const renamePath = (
	from: string,
	to: string,
): Effect.Effect<void, FileUnwritable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.rename(from, to).pipe(Effect.mapError(unwritable(from)));
	});

export const removePath = (
	path: string,
): Effect.Effect<void, FileUnwritable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.remove(path).pipe(Effect.mapError(unwritable(path)));
	});

/**
 * Removes one directory that holds nothing. `rmdir` and not `rm`: a folder with a file in
 * it is refused by the platform, where `rm` would need `recursive` and could empty it.
 */
export const removeEmptyDir = (path: string): Effect.Effect<void, FileUnwritable> =>
	Effect.try({ try: () => rmdirSync(path), catch: unwritable(path) });

export type FileStats = {
	readonly size: number;
	readonly mtimeNs: number;
	readonly ino: number;
};

/**
 * Synchronous reads for the catalog.
 *
 * The index consumes byte ranges and must finish a batch without interleaving, so these
 * stay synchronous; they are Effects only so the caller does not have to guess. Step 5
 * runs the whole batch inside a worker, where a synchronous read blocks nothing that
 * serves a request.
 */
export const statFile = (path: string): Effect.Effect<FileStats, FileUnreadable> =>
	Effect.try({
		try: () => {
			const stats = statSync(path, { bigint: true });
			return { ino: Number(stats.ino), mtimeNs: Number(stats.mtimeNs), size: Number(stats.size) };
		},
		catch: unreadable(path),
	});

export const readTextSync = (path: string): Effect.Effect<string, FileUnreadable> =>
	Effect.try({ try: () => readFileSync(path, "utf8"), catch: unreadable(path) });

/** Reads `length` bytes from `offset`; a short read at the end yields the bytes that exist. */
export const readRangeSync = (
	path: string,
	offset: number,
	length: number,
): Effect.Effect<string, FileUnreadable> =>
	Effect.try({
		try: () => {
			const fd = openSync(path, "r");
			try {
				const buffer = Buffer.alloc(length);
				const read = readSync(fd, buffer, 0, length, offset);
				return buffer.subarray(0, read).toString("utf8");
			} finally {
				closeSync(fd);
			}
		},
		catch: unreadable(path),
	});

/** Every `.jsonl` under these roots, recursively; a missing root contributes nothing. */
export const listJsonl = (roots: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<string>> =>
	Effect.sync(() => {
		const files: string[] = [];
		for (const root of roots) {
			let entries: ReadonlyArray<string>;
			try {
				entries = readdirSync(root, { encoding: "utf8", recursive: true });
			} catch {
				continue;
			}
			for (const entry of entries) if (entry.endsWith(".jsonl")) files.push(join(root, entry));
		}
		return files;
	});

export const ensureDir = (
	path: string,
): Effect.Effect<void, FileUnwritable, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.makeDirectory(path, { recursive: true }).pipe(Effect.mapError(unwritable(path)));
	});

/**
 * Streams a response body to a file, stopping at the cap instead of after it.
 *
 * The old importer read the whole body and then checked its size, so a server that sent
 * no `content-length` could fill memory before the check ran (F8k). This counts bytes as
 * they arrive, cancels the body on the first one past the cap, and removes the partial
 * file so a failed import leaves nothing behind.
 */
export const writeStreamCapped = (
	path: string,
	body: ReadableStream<Uint8Array>,
	maxBytes: number,
): Effect.Effect<number, FileTooLarge | FileUnwritable> =>
	Effect.tryPromise({
		try: async () => {
			const handle = await open(path, "w");
			let total = 0;
			let tooLarge = false;
			try {
				const reader = body.getReader();
				for (;;) {
					// oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk at a time
					const { done, value } = await reader.read();
					if (done) break;
					total += value.byteLength;
					if (total > maxBytes) {
						tooLarge = true;
						// oxlint-disable-next-line no-await-in-loop -- cancel before the loop ends
						await reader.cancel();
						break;
					}
					// oxlint-disable-next-line no-await-in-loop -- write each chunk as it arrives
					await handle.write(value);
				}
			} finally {
				await handle.close();
			}
			if (tooLarge) {
				await rm(path, { force: true });
				throw new FileTooLarge({
					maxBytes,
					path,
					reason: `The body is larger than ${maxBytes} bytes.`,
				});
			}
			return total;
		},
		catch: (cause) =>
			cause instanceof FileTooLarge ? cause : new FileUnwritable({ path, reason: describe(cause) }),
	});
