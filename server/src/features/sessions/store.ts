/**
 * Epsilon's own session state in the agent home, beside pi's files: the pinned
 * chat ids and the trash of deleted chats.
 *
 * Pinned ids are a preference, not pi state. pi has no pin concept, so one small
 * private file in the agent home holds them and the list route joins it to pi's
 * sessions. Unknown keys survive, like every other file.
 */
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";
import type { TrashList, TrashedSession } from "./contract";

const pinsSchema = z.looseObject({ sessions: z.array(z.string()) });

type Pins = z.infer<typeof pinsSchema>;

const document = (home: AgentHome) =>
	jsonDocument(home.pinsFile, {
		schema: pinsSchema,
		empty: (): Pins => ({ sessions: [] }),
		policy: "private",
		wording: {
			problem: (cause, path) => `Pinned chats could not be read (${cause}) from ${path}.`,
			refusal: (path, problem) => `Epsilon did not write pinned chats because ${path} ${problem}.`,
		},
	});

export type PinnedState = { ids: ReadonlySet<string>; problem: string | undefined };

/** One tolerant read for the list route. A broken file is an empty set plus why. */
export const readPinned = async (home: AgentHome): Promise<PinnedState> => {
	const { value, problem } = await document(home).read();
	return { ids: new Set(value.sessions), problem };
};

/** Add or remove one id, keeping every pin the file already holds. */
export const writePinned = async (home: AgentHome, id: string, pinned: boolean): Promise<void> => {
	await document(home).update((current) => {
		const sessions = new Set(current.sessions);
		if (pinned) sessions.add(id);
		else sessions.delete(id);
		return { ...current, sessions: [...sessions] };
	});
};

/*
 * The trash. pi exposes no delete, so Epsilon removes a session file itself; the
 * trash is what makes that recoverable. The file moves to `<agent home>/trash`
 * with a sidecar beside it naming the folder it came from, and the folder sits
 * beside `sessions/`, never inside it, because pi lists every subdirectory of
 * `sessions/` as a live session folder.
 *
 * The sidecar also carries the name and first message pi derives, because it
 * derives them while listing and an opened file answers neither, so the record of
 * a deleted chat captures them as it moves. Purging is the only step that
 * destroys a file.
 */

/** pi's own session-id shape, so an id from a URL can name a file and never a path. */
const sessionIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

const sidecarSchema = z.looseObject({
	/** The absolute path the file had in pi's `sessions/` folder. */
	path: z.string().min(1),
	/** When the file moved, as an ISO timestamp. */
	deletedAt: z.string(),
	name: z.string().optional(),
	firstMessage: z.string(),
});

type Sidecar = z.infer<typeof sidecarSchema>;

const trashedFile = (home: AgentHome, id: string): string => join(home.trashDir, `${id}.jsonl`);

const sidecarFile = (home: AgentHome, id: string): string => join(home.trashDir, `${id}.json`);

const sidecar = (home: AgentHome, id: string) =>
	jsonDocument(sidecarFile(home, id), {
		schema: sidecarSchema,
		empty: (): Sidecar => ({ path: "", deletedAt: "", firstMessage: "" }),
		policy: "private",
		wording: {
			problem: (cause, path) =>
				`A deleted chat's record could not be read (${cause}) from ${path}.`,
			refusal: (path, problem) =>
				`Epsilon did not move the chat to its trash because ${path} ${problem}.`,
		},
	});

const orphanProblem = (count: number): string =>
	count === 1
		? "1 deleted chat has no record of where it came from, so it cannot be restored."
		: `${count} deleted chats have no record of where they came from, so they cannot be restored.`;

/** One listed chat: the record's fields, and nothing its file may have grown since. */
const entryOf = (id: string, record: Sidecar): TrashedSession => ({
	id,
	path: record.path,
	deletedAt: record.deletedAt,
	name: record.name,
	firstMessage: record.firstMessage,
});

/** Every chat in the trash, newest deletion first. A chat without a usable record is counted, not listed. */
export const listTrash = async (home: AgentHome): Promise<TrashList> => {
	let names: string[];
	try {
		names = await readdir(home.trashDir);
	} catch (cause) {
		// Nothing deleted yet: the folder is created by the first delete, not before.
		if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") names = [];
		else throw cause;
	}
	const entries: TrashedSession[] = [];
	let unrecorded = 0;
	for (const name of names) {
		if (!name.endsWith(".jsonl")) continue;
		const id = name.slice(0, -".jsonl".length);
		const { value, problem } = await sidecar(home, id).read();
		if (problem !== undefined || value.path === "") {
			unrecorded += 1;
			continue;
		}
		entries.push(entryOf(id, value));
	}
	entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
	return unrecorded === 0 ? { entries } : { entries, problem: orphanProblem(unrecorded) };
};

/**
 * Move one chat's file into the trash. The record is written first: a file that
 * moved without one could never be put back where pi lists it.
 */
export const trashSession = async (
	home: AgentHome,
	chat: { id: string; file: string; name?: string; firstMessage: string },
): Promise<void> => {
	await mkdir(home.trashDir, { recursive: true });
	await sidecar(home, chat.id).update(() => ({
		path: chat.file,
		deletedAt: new Date().toISOString(),
		name: chat.name,
		firstMessage: chat.firstMessage,
	}));
	await rename(chat.file, trashedFile(home, chat.id));
};

const readTrashed = async (home: AgentHome, id: string): Promise<TrashedSession | undefined> => {
	if (!sessionIdPattern.test(id)) return undefined;
	const { value, problem } = await sidecar(home, id).read();
	if (problem !== undefined || value.path === "") return undefined;
	const file = await stat(trashedFile(home, id)).catch(() => undefined);
	return file === undefined ? undefined : entryOf(id, value);
};

export type RestoreOutcome =
	| { ok: true; path: string }
	/** `missing` is a chat the trash does not hold; `taken` is one whose own file came back. */
	| { ok: false; reason: "missing" | "taken" };

/**
 * Put a chat's file back where pi's list finds it again. A file already sitting at
 * that path is refused instead of overwritten: it is a chat the operator still has.
 */
export const restoreTrash = async (home: AgentHome, id: string): Promise<RestoreOutcome> => {
	const entry = await readTrashed(home, id);
	if (entry === undefined) return { ok: false, reason: "missing" };
	const existing = await stat(entry.path).catch(() => undefined);
	if (existing !== undefined) return { ok: false, reason: "taken" };
	await mkdir(dirname(entry.path), { recursive: true });
	await rename(trashedFile(home, id), entry.path);
	await rm(sidecarFile(home, id), { force: true });
	return { ok: true, path: entry.path };
};

/** The only step that destroys a chat: its file and its record both go. */
export const purgeTrash = async (home: AgentHome, id: string): Promise<boolean> => {
	if (!sessionIdPattern.test(id)) return false;
	const file = await stat(trashedFile(home, id)).catch(() => undefined);
	if (file === undefined) return false;
	await rm(trashedFile(home, id), { force: true });
	await rm(sidecarFile(home, id), { force: true });
	return true;
};
