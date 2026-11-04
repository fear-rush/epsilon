import { join } from "node:path";

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { Effect, FileSystem } from "effect";

import type { ExportFormat, ExportedSession } from "#protocol/conversation/export";
import { CommandRefused } from "#protocol/errors";

/**
 * pi's own exporter, which only writes to a file: an export runs into a scratch folder
 * that is read back and removed, so the engine keeps nothing. The caller owns the
 * session, so nothing here disposes or releases it.
 */

const FILE: Record<ExportFormat, { extension: string; mimeType: string }> = {
	html: { extension: "html", mimeType: "text/html;charset=utf-8" },
	jsonl: { extension: "jsonl", mimeType: "application/x-ndjson" },
};

/**
 * The stem of a download's name: the chat's own name when it has one, else its id, with
 * everything a file system or a browser would read as a path removed.
 */
const exportStem = (name: string | undefined, sessionId: string): string => {
	const cleaned = (name ?? "")
		.replaceAll(/[^\p{L}\p{N}._-]+/gu, "-")
		.replaceAll(/^[-.]+|[-.]+$/g, "");
	// Count code points, so a truncation cannot cut a character in half.
	const stem = Array.from(cleaned).slice(0, 80).join("");
	return stem === "" ? `session-${sessionId}` : stem;
};

/** One chat's transcript, as the bytes pi wrote and the name to save them under. */
export const exportOf = (
	agent: AgentSession,
	sessionId: string,
	format: ExportFormat,
): Effect.Effect<ExportedSession, CommandRefused, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const folder = yield* fs
			.makeTempDirectory({ prefix: "epsilon-export-" })
			.pipe(
				Effect.mapError(
					(cause) => new CommandRefused({ command: "export", reason: String(cause) }),
				),
			);
		const { extension, mimeType } = FILE[format];
		const path = join(folder, `session.${extension}`);
		const cleanup = fs
			.remove(folder, { force: true, recursive: true })
			.pipe(Effect.orElseSucceed(() => undefined));
		return yield* Effect.gen(function* () {
			if (format === "html") {
				yield* Effect.tryPromise({
					try: () => agent.exportToHtml(path),
					catch: (cause) => new CommandRefused({ command: "export", reason: String(cause) }),
				});
			} else {
				yield* Effect.try({
					try: () => agent.exportToJsonl(path),
					catch: (cause) => new CommandRefused({ command: "export", reason: String(cause) }),
				});
			}
			const text = yield* fs
				.readFileString(path)
				.pipe(
					Effect.mapError(
						(cause) => new CommandRefused({ command: "export", reason: String(cause) }),
					),
				);
			return {
				// The name the page shows is the session manager's, which the rename writes.
				filename: `${exportStem(agent.sessionManager.getSessionName(), sessionId)}.${extension}`,
				mimeType,
				text,
			};
		}).pipe(Effect.ensuring(cleanup));
	});
