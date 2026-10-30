/**
 * The two `mcp.json` files: where they are, how one document is read and written,
 * and the ordering that keeps a read-modify-write on one file whole.
 *
 * A missing file is an empty document, a file that is not a regular file of a
 * bounded size is reported by path, and a parse error never quotes the file (it
 * may hold a literal secret). The entry shape itself is in `mcp-entry.ts`.
 */
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import type { McpScope } from "shared";

import type { McpRawEntry } from "./mcp-entry";
import { writeJson } from "./store";

/** The most a file may hold before it is reported instead of parsed. */
const MCP_MAX_BYTES = 1_000_000;

/** The JSON a file holds, decoded at the read boundary and kept as it was. */
const mcpFileSchema = z.looseObject({
	autoEnableCodemode: z.boolean().optional(),
	mcpServers: z.record(z.string(), z.json()).optional(),
});

export type McpFile = z.infer<typeof mcpFileSchema>;

/** The file one scope writes, which is also the file pi loads for it. */
export const mcpScopePath = (scope: McpScope, home: string, projectDir: string): string =>
	scope === "global" ? join(home, "mcp.json") : join(projectDir, ".pi", "mcp.json");

export const projectMcpPath = (projectDir: string): string =>
	mcpScopePath("project", "", projectDir);

const emptyDocument = (): McpFile => ({ mcpServers: {} });

const stripBom = (text: string): string => text.replace(/^\uFEFF/, "");

/**
 * Read one file without trusting it. A problem means no server of that file is
 * listed; the other file still lists.
 */
export async function readMcpDocument(
	path: string,
): Promise<{ document: McpFile; problem?: string }> {
	const info = await stat(path).catch(() => undefined);
	if (info === undefined) return { document: emptyDocument() };
	if (!info.isFile()) {
		return {
			document: emptyDocument(),
			problem: `${path} is not a regular file, so its servers are not listed.`,
		};
	}
	if (info.size > MCP_MAX_BYTES) {
		return {
			document: emptyDocument(),
			problem: `${path} is larger than 1 MB, so its servers are not listed.`,
		};
	}
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return {
			document: emptyDocument(),
			problem: `${path} could not be read, so its servers are not listed.`,
		};
	}
	let decoded: McpRawEntry;
	try {
		// The parse boundary: anything JSON can hold, and nothing else.
		decoded = z.json().parse(JSON.parse(stripBom(text)));
	} catch {
		return {
			document: emptyDocument(),
			problem: `${path} is not valid JSON, so its servers are not listed.`,
		};
	}
	const parsed = mcpFileSchema.safeParse(decoded);
	if (!parsed.success) {
		return {
			document: emptyDocument(),
			problem: `${path} is not an object with an "mcpServers" object, so its servers are not listed.`,
		};
	}
	return { document: parsed.data };
}

/** A write must never replace a file it cannot read, or it would drop the operator's config. */
export async function readMcpDocumentForWrite(path: string): Promise<McpFile> {
	const { document, problem } = await readMcpDocument(path);
	if (problem !== undefined) {
		throw new Error(`${basename(path)} cannot be written: ${problem}`);
	}
	return document;
}

/**
 * Write one document back. The agent home's file is always 0600; a project file
 * keeps the mode the repository gave it, and is created 0644.
 */
export const writeMcpDocument = async (
	scope: McpScope,
	path: string,
	document: McpFile,
): Promise<void> => {
	const mode = scope === "global" ? 0o600 : await projectFileMode(path);
	await writeJson(path, document, mode);
};

const projectFileMode = async (path: string): Promise<number> => {
	const info = await stat(path).catch(() => undefined);
	return info === undefined ? 0o644 : info.mode & 0o777;
};

/**
 * Serialize read-modify-write on one file, so two tabs cannot both read the old
 * text and let the later write drop the earlier change. The write queue in
 * `store.ts` only orders the final write.
 */
const operations = new Map<string, Promise<unknown>>();

export const withMcpFile = async <T>(path: string, work: () => Promise<T>): Promise<T> => {
	const previous = operations.get(path) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(work);
	operations.set(path, next);
	try {
		return await next;
	} finally {
		if (operations.get(path) === next) operations.delete(path);
	}
};
