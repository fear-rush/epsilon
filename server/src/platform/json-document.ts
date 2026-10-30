/**
 * The one way this server reads and writes pi's documented JSON files
 * (`models.json`, `mcp.json`). pi ships no writer for them
 * (docs/pi-sdk.md), so the dashboard parses them with zod and merges
 * its change into what is there; the schemas are loose, so unknown keys survive.
 *
 * A read is tolerant: a file that is missing is empty, and one that cannot be
 * used is empty plus one sentence that says why, so the panel can render and
 * still tell the truth. The sentence never quotes the file, which may hold a
 * literal secret. An update is the opposite: it holds a lock on the path for the
 * whole read-modify-write, refuses to replace a file it cannot parse, and writes
 * atomically, so a crash or a second tab cannot leave half a file or drop a change.
 */
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ZodType } from "zod";

/** The most a file may hold before it is reported instead of parsed. */
const MAX_BYTES = 1_000_000;

export type ProblemCause = "not-file" | "too-large" | "unreadable" | "not-json" | "wrong-shape";

/** The sentences a document's panel shows; each file names what is lost. */
export type Wording = {
	problem: (cause: ProblemCause, path: string) => string;
	refusal: (path: string, problem: string) => string;
};

/**
 * `private` is the agent home's files, which can hold a key or a bearer token:
 * always 0600. `project` is a repository file: it keeps the mode it has, and is
 * created 0644.
 */
export type FilePolicy = "private" | "project";

type Read<T> = { value: T; problem?: string };

export type JsonDocument<T> = {
	/** The file as it is. A problem means `value` is the empty shape. */
	read: () => Promise<Read<T>>;
	/**
	 * Read, change, write, under the path's lock. `change` returns what to write,
	 * or `undefined` to leave the file alone. Throws, writing nothing, when the
	 * file cannot be parsed.
	 */
	update: (change: (current: T) => T | undefined | Promise<T | undefined>) => Promise<void>;
};

export type JsonDocumentOptions<T> = {
	schema: ZodType<T>;
	/** A fresh empty value every call: `update` callers change it in place. */
	empty: () => T;
	policy: FilePolicy;
	wording: Wording;
};

const locks = new Map<string, Promise<unknown>>();

const locked = async <R>(path: string, work: () => Promise<R>): Promise<R> => {
	const previous = locks.get(path) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(work);
	locks.set(path, next);
	try {
		return await next;
	} finally {
		if (locks.get(path) === next) locks.delete(path);
	}
};

const stripBom = (text: string): string => text.replace(/^﻿/, "");

const modeFor = async (path: string, policy: FilePolicy): Promise<number> => {
	if (policy === "private") return 0o600;
	const info = await stat(path).catch(() => undefined);
	return info === undefined ? 0o644 : info.mode & 0o777;
};

/**
 * Write beside the target and rename over it, so a reader sees the old file or
 * the new one, never half of either. A symlinked file is written through the
 * link, so a dotfiles setup keeps its link.
 */
const writeAtomic = async (path: string, text: string, mode: number): Promise<void> => {
	const target = await realpath(path).catch(() => path);
	await mkdir(dirname(target), { recursive: true });
	const temp = join(dirname(target), `.${basename(target)}.${crypto.randomUUID()}.tmp`);
	try {
		await writeFile(temp, text, { encoding: "utf8", mode });
		// `mode` on create is masked by the umask; the policy is exact.
		await chmod(temp, mode);
		await rename(temp, target);
	} catch (error) {
		await rm(temp, { force: true });
		throw error;
	}
};

export const jsonDocument = <T>(path: string, options: JsonDocumentOptions<T>): JsonDocument<T> => {
	const { schema, empty, policy, wording } = options;
	const unusable = (cause: ProblemCause): Read<T> => ({
		value: empty(),
		problem: wording.problem(cause, path),
	});

	const read = async (): Promise<Read<T>> => {
		const info = await stat(path).catch(() => undefined);
		// An absent file is not a problem: pi creates it on first use.
		if (info === undefined) return { value: empty() };
		if (!info.isFile()) return unusable("not-file");
		if (info.size > MAX_BYTES) return unusable("too-large");
		let text: string;
		try {
			text = await readFile(path, "utf8");
		} catch {
			return unusable("unreadable");
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(stripBom(text));
		} catch {
			return unusable("not-json");
		}
		const parsed = schema.safeParse(decoded);
		return parsed.success ? { value: parsed.data } : unusable("wrong-shape");
	};

	const update: JsonDocument<T>["update"] = (change) =>
		locked(path, async () => {
			const { value, problem } = await read();
			if (problem !== undefined) throw new Error(wording.refusal(path, problem));
			const next = await change(value);
			if (next === undefined) return;
			await writeAtomic(path, `${JSON.stringify(next, null, 2)}\n`, await modeFor(path, policy));
		});

	return { read, update };
};
