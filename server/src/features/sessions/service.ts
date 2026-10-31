/**
 * Session files joined with the live state that only this server knows. pi knows
 * a session exists and which folder it ran in; only the registry knows an engine
 * holds it and whether it waits for an answer. Removing a file is our own disk
 * operation (pi has no delete): it resolves the id through pi's own listing,
 * closes an idle engine first, and refuses only while a turn is still working.
 * The browser never sends a session path.
 */
import { rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { forkSession, listAllSessions, locateSession, setSessionName } from "../../platform/pi";
import type { StoredSession } from "../../platform/pi";
import { ProjectNotTrustedError, placeOf, projectStatus, trustedProjectFolder } from "../projects";
import type { SessionErrorCode, SessionList, SessionSummary } from "./contract";
import { writePinned } from "./store";

type Live = { id: string; needsInput: boolean };

const newestFirst = (a: SessionSummary, b: SessionSummary): number =>
	b.modified.localeCompare(a.modified);

/** Pinned rows lead, then the usual newest-first order inside each place. */
const byPinnedThenNewest = (a: SessionSummary, b: SessionSummary): number => {
	if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
	return newestFirst(a, b);
};

const newestActivity = (sessions: SessionSummary[]): string =>
	sessions.reduce((latest, session) => (session.modified > latest ? session.modified : latest), "");

export const groupSessions = (
	home: AgentHome,
	stored: StoredSession[],
	live: Live[],
	pinned: ReadonlySet<string>,
): SessionList => {
	const byId = new Map(live.map((session) => [session.id, session]));
	const chats: SessionSummary[] = [];
	const projects = new Map<string, SessionSummary[]>();
	for (const session of stored) {
		const running = byId.get(session.id);
		const summary: SessionSummary = {
			...session,
			pinned: pinned.has(session.id),
			running: running !== undefined,
			needsInput: running?.needsInput ?? false,
		};
		const place = placeOf(session.cwd, home.chatsDir);
		if (place.kind === "chat") chats.push(summary);
		// A session from before pi recorded folders has no cwd and no place to run.
		else if (place.path !== "")
			projects.set(place.path, [...(projects.get(place.path) ?? []), summary]);
	}
	return {
		chats: chats.sort(byPinnedThenNewest),
		projects: [...projects]
			.map(([path, sessions]) => ({
				project: projectStatus(home, path),
				sessions: sessions.sort(byPinnedThenNewest),
			}))
			.sort((a, b) => newestActivity(b.sessions).localeCompare(newestActivity(a.sessions))),
	};
};

export type SessionOutcome<Value> =
	| { ok: true; value: Value }
	| { ok: false; code: SessionErrorCode; message: string };

const running: SessionOutcome<never> = {
	ok: false,
	code: "SESSION_RUNNING",
	message: "A live agent still holds this session. Stop it first.",
};

const notFound: SessionOutcome<never> = {
	ok: false,
	code: "SESSION_NOT_FOUND",
	message: "The agent home has no such session.",
};

/** Drops the pin of a deleted session. A broken pins file is reported by the list, not here. */
const forgetPin = (home: AgentHome, id: string): Promise<void> =>
	writePinned(home, id, false).catch(() => undefined);

/** `closeIfIdle` drops an idle engine and answers false while the session is working. */
export const deleteSession = async (
	home: AgentHome,
	id: string,
	closeIfIdle: (id: string) => boolean,
): Promise<SessionOutcome<null>> => {
	const located = await locateSession(id);
	if (located === undefined) return notFound;
	if (!closeIfIdle(id)) return running;
	// `force` makes a second delete of the same id succeed: the file is already gone.
	await rm(located.file, { force: true });
	await forgetPin(home, id);
	return { ok: true, value: null };
};

/**
 * Takes a project off Epsilon's list by deleting every session pi recorded in that
 * folder. The list has no other source (docs/DECISIONS.md, Chats and projects), so
 * nothing else is written; the folder and pi's trust record stay.
 */
export const removeProject = async (
	home: AgentHome,
	path: string,
	closeIfIdle: (id: string) => boolean,
): Promise<SessionOutcome<{ removed: number }>> => {
	const sessions = (await listAllSessions()).filter((session) => {
		const place = placeOf(session.cwd, home.chatsDir);
		return place.kind === "project" && place.path === path;
	});
	if (sessions.length === 0) {
		return {
			ok: false,
			code: "SESSION_NOT_FOUND",
			message: "Epsilon has no chats in that folder.",
		};
	}
	const busy = sessions.filter((session) => !closeIfIdle(session.id));
	if (busy.length > 0) {
		return {
			ok: false,
			code: "SESSION_RUNNING",
			message: `${busy.length === 1 ? "A chat" : `${busy.length} chats`} in this project are still working. Stop them first.`,
		};
	}
	const folders = new Set<string>();
	for (const session of sessions) {
		const located = await locateSession(session.id);
		if (located === undefined) continue;
		await rm(located.file, { force: true });
		folders.add(dirname(located.file));
		await forgetPin(home, session.id);
	}
	// pi keeps one folder per project under `sessions/`; drop it once it is empty.
	for (const folder of folders) await rmdir(folder).catch(() => undefined);
	return { ok: true, value: { removed: sessions.length } };
};

/**
 * Move a chat into a trusted project: pi forks the whole history into a new
 * session in that folder, then the chat's own file is removed. The new session
 * runs with the project's resources from its next turn on.
 */
export const moveSessionToProject = async (
	home: AgentHome,
	id: string,
	project: string,
	isRunning: boolean,
): Promise<SessionOutcome<{ id: string }>> => {
	if (isRunning) return running;
	const located = await locateSession(id);
	if (located === undefined) return notFound;
	let folder: string;
	try {
		folder = await trustedProjectFolder(home, project);
	} catch (error) {
		return {
			ok: false,
			code: error instanceof ProjectNotTrustedError ? "PROJECT_NOT_TRUSTED" : "PROJECT_INVALID",
			message: error instanceof Error ? error.message : String(error),
		};
	}
	if (located.cwd === folder) return { ok: true, value: { id } };
	const moved = forkSession(located.file, folder);
	await rm(located.file, { force: true });
	return { ok: true, value: { id: moved } };
};

/**
 * Rename through the live engine when one holds the session; otherwise append the
 * name to the file. The caller polls the list, and the engine resyncs its snapshot.
 */
export const renameSession = async (
	id: string,
	name: string,
	renameLive: ((name: string) => boolean) | undefined,
): Promise<SessionOutcome<{ id: string; name: string }>> => {
	if (renameLive?.(name) === true) return { ok: true, value: { id, name } };
	const located = await locateSession(id);
	if (located === undefined) return notFound;
	setSessionName(located.file, located.cwd, name);
	return { ok: true, value: { id, name } };
};

/** Pin is Epsilon's own preference, so only an existing session may be pinned. */
export const pinSession = async (
	home: AgentHome,
	id: string,
	pinned: boolean,
): Promise<SessionOutcome<null>> => {
	const located = await locateSession(id);
	if (located === undefined) return notFound;
	await writePinned(home, id, pinned);
	return { ok: true, value: null };
};
