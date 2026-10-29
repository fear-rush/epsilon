/**
 * Reading and writing pi's documented JSON files. pi exposes `SettingsManager`
 * and `DefaultPackageManager`, but no writer for `models.json` or `mcp.json`
 * (docs/reference/pi-sdk.md), so the dashboard parses those files with zod and
 * merges them itself. A write keeps unknown keys: a hand-edited block stays
 * valid and other entries are never dropped (ADR-0012).
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ZodType } from "zod";

/** Missing or malformed reads as the empty shape, so the panel can still show. */
export const readJson = async <T>(path: string, schema: ZodType<T>, empty: T): Promise<T> => {
	try {
		return schema.parse(JSON.parse(await readFile(path, "utf8")));
	} catch {
		return empty;
	}
};

/**
 * A file a list read had to treat as empty. The read path stays tolerant so the
 * panel renders, and this names the file so the panel can say why a list is
 * empty instead of pretending it is the truth (AGENTS.md rule 7).
 */
export const unreadableFile = async (
	path: string,
	schema: ZodType<unknown>,
): Promise<string | undefined> => {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		// An absent file is not a problem: pi creates it on first use.
		return undefined;
	}
	try {
		schema.parse(JSON.parse(raw));
		return undefined;
	} catch {
		return `${basename(path)} cannot be read by this version of Settings. Fix it in a terminal inside this deployment, then reload.`;
	}
};

/**
 * A write must never clobber a file it cannot read: pi may have written a shape
 * this version does not parse, and replacing it would lose the operator's config.
 */
export const readJsonForWrite = async <T>(
	path: string,
	schema: ZodType<T>,
	empty: T,
): Promise<T> => {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return empty;
	}
	try {
		return schema.parse(JSON.parse(raw));
	} catch {
		throw new Error(`${basename(path)} is not valid for pi; fix or remove it before editing here.`);
	}
};

/** Serialize writes to one path, so two panel clicks cannot lose each other. */
const queues = new Map<string, Promise<void>>();

export const writeJson = <T>(path: string, value: T): Promise<void> => {
	const previous = queues.get(path) ?? Promise.resolve();
	const next = previous
		.catch(() => undefined)
		.then(async () => {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
			// These files can hold an API key or a bearer token.
			await chmod(path, 0o600).catch(() => undefined);
		});
	queues.set(path, next);
	return next;
};

/** The credential file `ModelRuntime.login()` and `logout()` own. */
export const authPath = (home: string): string => join(home, "auth.json");
export const modelsPath = (home: string): string => join(home, "models.json");
export const mcpPath = (home: string): string => join(home, "mcp.json");
export const skillsPath = (home: string): string => join(home, "skills");
