/**
 * pi's own exporter, which only writes to a file: an export runs into a scratch
 * folder that is read back and removed, so the engine keeps nothing. The caller
 * owns the engine, so nothing here disposes or releases it (docs/DECISIONS.md,
 * Export).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentSession } from "@earendil-works/pi-coding-agent";

/** The two files pi writes a transcript as, and the type a browser saves each under. */
export type ExportFormat = "html" | "jsonl";

const EXPORT_FILE: Record<ExportFormat, { extension: string; mimeType: string }> = {
	html: { extension: "html", mimeType: "text/html;charset=utf-8" },
	jsonl: { extension: "jsonl", mimeType: "application/x-ndjson" },
};

/** What a browser saves: the bytes pi wrote, and the name to save them under. */
export type ExportedSession = { filename: string; mimeType: string; text: string };

/**
 * The stem of a download's name. The chat's own name when it has one, else its id,
 * with everything a file system or a browser would read as a path removed.
 */
const exportStem = (name: string | undefined, sessionId: string): string => {
	const cleaned = (name ?? "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|[-.]+$/g, "");
	// Count code points, so a truncation cannot cut a character in half.
	const stem = [...cleaned].slice(0, 80).join("");
	return stem === "" ? `session-${sessionId}` : stem;
};

/** One chat's transcript, as the bytes pi wrote and the name to save them under. */
export const exportSession = async (
	agent: AgentSession,
	sessionId: string,
	format: ExportFormat,
): Promise<ExportedSession> => {
	const { extension, mimeType } = EXPORT_FILE[format];
	const folder = await mkdtemp(join(tmpdir(), "epsilon-export-"));
	const path = join(folder, `session.${extension}`);
	try {
		if (format === "html") await agent.exportToHtml(path);
		else agent.exportToJsonl(path);
		const text = await readFile(path, "utf8");
		return {
			filename: `${exportStem(agent.sessionName, sessionId)}.${extension}`,
			mimeType,
			text,
		};
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
};
