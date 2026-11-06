/**
 * Turns one session file into index rows, with pi's own `buildSessionInfo` semantics.
 *
 * Nothing here is Epsilon's opinion: `messageCount` counts every `message` entry (tool
 * results included), `firstMessage` is the first non-empty user text or "(no messages)",
 * the name is the latest `session_info`, and the activity time is the newest user or
 * assistant message. The conformance test is what keeps this file honest; when pi changes
 * a rule, that test fails before a chat goes missing from the list.
 */

export type StoredSummary = {
	readonly path: string;
	readonly id: string;
	readonly cwd: string;
	readonly name: string | undefined;
	readonly parentSession: string | undefined;
	readonly created: number;
	readonly lastActivity: number;
	readonly messageCount: number;
	readonly firstMessage: string;
	readonly leafId: string | null;
	readonly size: number;
	readonly mtimeNs: number;
	readonly ino: number;
	readonly parsedBytes: number;
	readonly headHash: string;
};

export type StoredEntry = {
	readonly entryId: string;
	readonly parentId: string | null;
	readonly kind: string;
	readonly ts: number | null;
	/** Byte offset of the line in the file, so a transcript row can be read alone. */
	readonly offset: number;
	readonly length: number;
};

export type ParseResult = {
	readonly summary: StoredSummary;
	readonly entries: ReadonlyArray<StoredEntry>;
};

type MessageContent = string | ReadonlyArray<{ readonly type?: string; readonly text?: string }>;

const textOf = (content: MessageContent): string => {
	if (typeof content === "string") return content;
	return content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text ?? "")
		.join(" ");
};

/** The subset of a pi line this module reads. Everything else is ignored, not rejected. */
type Line = {
	readonly type?: string;
	readonly id?: string;
	readonly parentId?: string | null;
	readonly timestamp?: string;
	readonly name?: string;
	readonly cwd?: string;
	readonly parentSession?: string;
	readonly summary?: string;
	readonly fromId?: string;
	readonly message?: {
		readonly role?: string;
		readonly content?: MessageContent;
		readonly timestamp?: number;
	};
};

const hashHead = (head: string): string => Bun.hash(head).toString(16);

const headBytes = 512;

/** Parses a whole file. `null` means the file is not a session pi would list. */
export function parseSession(
	path: string,
	text: string,
	stats: { readonly size: number; readonly mtimeNs: number; readonly ino: number },
	options: { readonly allowNoHeader?: boolean } = {},
): ParseResult | null {
	const lines = text.split("\n");
	let header: Line | undefined;
	let name: string | undefined;
	let messageCount = 0;
	let firstMessage = "";
	let lastActivity: number | undefined;
	let leafId: string | null = null;
	const entries: StoredEntry[] = [];
	let offset = 0;

	for (const [index, line] of lines.entries()) {
		const length = Buffer.byteLength(line, "utf8") + (index === lines.length - 1 ? 0 : 1);
		const lineOffset = offset;
		offset += length;
		if (line.trim() === "") continue;
		let parsed: Line;
		try {
			// SAFETY: the cast is only used to read optional fields; every field is checked
			// before it is trusted, and a line of another shape falls through as unknown.
			parsed = JSON.parse(line) as Line;
		} catch {
			// A half-written last line waits for the next pass; a broken middle line is pi's
			// problem too, and pi skips it, so the index skips it the same way.
			continue;
		}
		if (header === undefined && options.allowNoHeader !== true) {
			// The first entry of a session file is its header; anything else is not a session.
			if (parsed.type !== "session") return null;
			header = parsed;
			continue;
		}
		if (header === undefined) {
			// Continuation text: the header was parsed in an earlier pass.
		}
		if (typeof parsed.id === "string") leafId = parsed.id;
		if (parsed.type === "session_info") {
			const trimmed = parsed.name?.trim();
			// pi treats an empty name as a cleared name, not as an empty string.
			if (trimmed !== undefined && trimmed !== "") name = trimmed;
			else name = undefined;
		}
		if (typeof parsed.id === "string" && parsed.parentId !== undefined) {
			entries.push({
				entryId: parsed.id,
				kind:
					parsed.type === "message"
						? (parsed.message?.role ?? "message")
						: (parsed.type ?? "other"),
				length,
				offset: lineOffset,
				parentId: parsed.parentId ?? null,
				ts: typeof parsed.timestamp === "string" ? Date.parse(parsed.timestamp) : null,
			});
		}
		if (parsed.type !== "message") continue;
		messageCount++;
		const message = parsed.message;
		// pi counts every message entry, but only a user or assistant message moves the
		// activity time; a tool result carries the timestamp of the call it belongs to.
		if (message?.role !== "user" && message?.role !== "assistant") continue;
		const activity =
			typeof message.timestamp === "number"
				? message.timestamp
				: typeof parsed.timestamp === "string"
					? Date.parse(parsed.timestamp)
					: Number.NaN;
		if (Number.isFinite(activity)) lastActivity = Math.max(lastActivity ?? 0, activity);
		if (message.content === undefined) continue;
		const textContent = textOf(message.content);
		if (textContent === "") continue;
		if (firstMessage === "" && message.role === "user") firstMessage = textContent;
	}

	if (options.allowNoHeader !== true && (header === undefined || typeof header.id !== "string"))
		return null;
	const headerTime =
		typeof header?.timestamp === "string" ? Date.parse(header.timestamp) : Number.NaN;
	const created = Number.isNaN(headerTime) ? stats.mtimeNs / 1_000_000 : headerTime;
	const modified =
		lastActivity !== undefined && lastActivity > 0
			? lastActivity
			: Number.isNaN(headerTime)
				? stats.mtimeNs / 1_000_000
				: created;

	return {
		entries,
		summary: {
			created,
			cwd: typeof header?.cwd === "string" ? header.cwd : "",
			firstMessage: firstMessage || "(no messages)",
			headHash: hashHead(text.slice(0, headBytes)),
			id: header?.id ?? "",
			ino: stats.ino,
			lastActivity: modified,
			leafId,
			messageCount,
			mtimeNs: stats.mtimeNs,
			name,
			parentSession: header?.parentSession,
			parsedBytes: Buffer.byteLength(text, "utf8"),
			path,
			size: stats.size,
		},
	};
}

/**
 * What a re-parse must keep from the rows already stored when only new bytes were appended.
 * The caller passes the previous summary; the appended text is parsed alone and folded in.
 */
export function appendToSession(
	previous: StoredSummary,
	path: string,
	appendedText: string,
	stats: { readonly size: number; readonly mtimeNs: number; readonly ino: number },
	offsetBase: number,
): ParseResult {
	const parsed = parseSession(path, appendedText, stats, { allowNoHeader: true });
	const appendedEntries =
		parsed?.entries.map((entry) => ({
			...entry,
			offset: entry.offset + offsetBase,
		})) ?? [];
	if (parsed === null) {
		return {
			entries: appendedEntries,
			summary: { ...previous, parsedBytes: stats.size, size: stats.size, mtimeNs: stats.mtimeNs },
		};
	}
	const summary = parsed.summary;
	// A chunk parsed on its own has no message activity to find, and `parseSession` falls
	// back to the file's mtime for a whole file. Folding that in would say an appended
	// thinking-level entry moved the chat to now; only a user or assistant message counts.
	const appendedActivity = appendedEntries.reduce(
		(max, entry) =>
			entry.kind === "user" || entry.kind === "assistant" ? Math.max(max, entry.ts ?? 0) : max,
		0,
	);
	return {
		entries: appendedEntries,
		summary: {
			...previous,
			firstMessage:
				previous.firstMessage === "(no messages)" && summary.firstMessage !== "(no messages)"
					? summary.firstMessage
					: previous.firstMessage,
			lastActivity: Math.max(previous.lastActivity, appendedActivity),
			leafId: summary.leafId ?? previous.leafId,
			messageCount: previous.messageCount + summary.messageCount,
			mtimeNs: stats.mtimeNs,
			name: summary.name ?? previous.name,
			parsedBytes: stats.size,
			size: stats.size,
			headHash: previous.headHash,
			ino: stats.ino,
		},
	};
}
