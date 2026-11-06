import { useQueries } from "@tanstack/react-query";

import type { SessionSummary as WireSummary } from "#protocol/sessions";
import type { ProjectStatus } from "#protocol/settings/projects";
import { projectStatusQuery } from "@/core/queries";

import { useSessions } from "./use-sessions.ts";

/**
 * The sidebar's list, in the shape main's UI reads.
 *
 * The catalog answers one flat list; a folder is a project when pi's own status answers
 * for it, and Epsilon's chat folder is not one because the agent home is refused. The
 * adapter keeps the old row fields (ISO timestamps, live flags) so the ported components
 * stay theirs; the flags the new backend does not carry are false until it does.
 */
export type SessionSummary = {
	readonly id: string;
	readonly cwd: string;
	readonly name: string | undefined;
	readonly created: string;
	readonly modified: string;
	readonly messageCount: number;
	readonly firstMessage: string;
	readonly cwdMissing: boolean;
	readonly running: boolean;
	readonly needsInput: boolean;
	readonly pinned: boolean;
};

export type ProjectSessions = {
	readonly project: ProjectStatus;
	readonly sessions: ReadonlyArray<SessionSummary>;
	/** The newest chat's activity, which orders the folder groups. */
	readonly lastActivity: string;
};

/** A folder pi still records chats in, though the folder itself is gone. */
export type MissingFolder = {
	readonly path: string;
	readonly name: string;
	readonly sessions: ReadonlyArray<SessionSummary>;
	readonly lastActivity: string;
};

export type SessionList = {
	readonly chats: ReadonlyArray<SessionSummary>;
	readonly projects: ReadonlyArray<ProjectSessions>;
	readonly missing: ReadonlyArray<MissingFolder>;
	readonly pinsProblem?: string;
};

const rowOf = (session: WireSummary): SessionSummary => ({
	cwd: session.cwd,
	created: new Date(session.created).toISOString(),
	cwdMissing: session.cwdMissing,
	firstMessage: session.firstMessage,
	id: session.id,
	messageCount: session.messageCount,
	modified: new Date(session.lastActivity).toISOString(),
	name: session.name ?? undefined,
	needsInput: false,
	pinned: session.pinned,
	running: false,
});

/** Pinned first, then newest, the order the list route owns. */
const byWhen = (left: SessionSummary, right: SessionSummary): number => {
	if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
	return right.modified.localeCompare(left.modified);
};

/** The newest chat in a folder, for ordering the folders themselves. */
const newestActivity = (sessions: ReadonlyArray<SessionSummary>): string =>
	sessions.reduce((latest, session) => (session.modified > latest ? session.modified : latest), "");

/** The name a path ends in, for a folder pi no longer has a status for. */
const folderName = (path: string): string => path.split(/[/\\]/).findLast(Boolean) ?? path;

/** Newest chat first; a tie falls back to the name, so the order never depends on the walk. */
const byFolderActivity = (
	left: { readonly lastActivity: string; readonly name: string },
	right: { readonly lastActivity: string; readonly name: string },
): number =>
	right.lastActivity.localeCompare(left.lastActivity) || left.name.localeCompare(right.name);

const build = (
	sessions: ReadonlyArray<WireSummary>,
	statuses: ReadonlyMap<string, ProjectStatus>,
	pinsProblem: string | undefined,
): SessionList => {
	const chats: SessionSummary[] = [];
	const projects: ProjectSessions[] = [];
	const missing = new Map<string, SessionSummary[]>();
	const byFolder = new Map<string, SessionSummary[]>();

	for (const session of sessions) {
		const row = rowOf(session);
		// A folder that is gone is not a project: its trust read would fail, and the answer is
		// already on the row. It stays reachable in its own group instead of looking like a chat.
		if (session.cwdMissing) {
			const rows = missing.get(session.cwd);
			if (rows === undefined) missing.set(session.cwd, [row]);
			else rows.push(row);
			continue;
		}
		const project = statuses.get(session.cwd);
		if (project === undefined) {
			chats.push(row);
			continue;
		}
		const rows = byFolder.get(project.path);
		if (rows === undefined) byFolder.set(project.path, [row]);
		else rows.push(row);
	}

	for (const status of new Set(statuses.values())) {
		const rows = byFolder.get(status.path);
		if (rows === undefined) continue;
		const ordered = rows.toSorted(byWhen);
		projects.push({ lastActivity: newestActivity(ordered), project: status, sessions: ordered });
	}

	const missingFolders = [...missing.entries()].map(([path, rows]) => {
		const ordered = rows.toSorted(byWhen);
		return {
			lastActivity: newestActivity(ordered),
			name: folderName(path),
			path,
			sessions: ordered,
		};
	});

	const list: SessionList = {
		chats: chats.toSorted(byWhen),
		missing: missingFolders.toSorted(byFolderActivity),
		projects: projects.toSorted((left, right) =>
			byFolderActivity(
				{ lastActivity: left.lastActivity, name: left.project.name },
				{ lastActivity: right.lastActivity, name: right.project.name },
			),
		),
	};
	return pinsProblem === undefined ? list : { ...list, pinsProblem };
};

/**
 * The chat list plus one trust read per folder. It waits for the reads so a folder's
 * chats never appear as plain chats first and then move under a project.
 */ /** Folders that already hold chats, for the folder picker. The sidebar reads the same list. */
export function useRecentProjects(): ReadonlyArray<ProjectStatus> {
	const list = useSessionList();
	return list.data?.projects.map((entry) => entry.project) ?? [];
}

/** One chat from the grouped list, whether it is a chat or a project's. */
export function findSessionRow(
	list: SessionList | undefined,
	sessionId: string,
): SessionSummary | undefined {
	if (list === undefined) return undefined;
	const chat = list.chats.find((session) => session.id === sessionId);
	if (chat !== undefined) return chat;
	for (const project of list.projects) {
		const found = project.sessions.find((session) => session.id === sessionId);
		if (found !== undefined) return found;
	}
	for (const folder of list.missing) {
		const found = folder.sessions.find((session) => session.id === sessionId);
		if (found !== undefined) return found;
	}
	return undefined;
}

export function useSessionList() {
	// The list also carries the socket's change stream, so a write anywhere refreshes it.
	const sessions = useSessions();
	// A deleted folder has no status to ask for: `cwdMissing` already answers it, and skipping
	// the read keeps the 66 stale paths in a real home from failing one query each.
	const folders = [
		...new Set(
			(sessions.data?.sessions ?? [])
				.filter((session) => !session.cwdMissing)
				.map((session) => session.cwd),
		),
	].toSorted();
	const statuses = useQueries({
		queries: folders.map((folder) => projectStatusQuery(folder)),
	});

	const byFolder = new Map<string, ProjectStatus>();
	for (const [index, status] of statuses.entries()) {
		const folder = folders[index];
		if (folder !== undefined && status.data !== undefined) byFolder.set(folder, status.data);
	}

	const reading = statuses.some((status) => status.isPending);
	const data =
		sessions.data === undefined || reading
			? undefined
			: build(sessions.data.sessions, byFolder, sessions.data.pinsProblem);

	return {
		data,
		dataUpdatedAt: sessions.dataUpdatedAt,
		error: sessions.error,
		isError: sessions.isError,
		isPending: sessions.isPending || (sessions.data !== undefined && reading),
	};
}
