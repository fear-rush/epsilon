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
};

export type SessionList = {
	readonly chats: ReadonlyArray<SessionSummary>;
	readonly projects: ReadonlyArray<ProjectSessions>;
	readonly pinsProblem?: string;
};

const rowOf = (session: WireSummary): SessionSummary => ({
	cwd: session.cwd,
	created: new Date(session.created).toISOString(),
	cwdMissing: false,
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

const build = (
	sessions: ReadonlyArray<WireSummary>,
	statuses: ReadonlyMap<string, ProjectStatus>,
	pinsProblem: string | undefined,
): SessionList => {
	const chats: SessionSummary[] = [];
	const projects: ProjectSessions[] = [];
	const byFolder = new Map<string, SessionSummary[]>();

	for (const session of sessions) {
		const row = rowOf(session);
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
		projects.push({ project: status, sessions: rows.toSorted(byWhen) });
	}

	const list: SessionList = {
		chats: chats.toSorted(byWhen),
		projects: projects.toSorted((left, right) =>
			left.project.name.localeCompare(right.project.name),
		),
	};
	return pinsProblem === undefined ? list : { ...list, pinsProblem };
};

/**
 * The chat list plus one trust read per folder. It waits for the reads so a folder's
 * chats never appear as plain chats first and then move under a project.
 */
export function useSessionList() {
	// The list also carries the socket's change stream, so a write anywhere refreshes it.
	const sessions = useSessions();
	const folders = [
		...new Set((sessions.data?.sessions ?? []).map((session) => session.cwd)),
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
