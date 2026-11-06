import { useState } from "react";

import type { ProjectSessions, SessionSummary } from "./list.ts";

/** The search reads what the list already carries: a chat's name and first message. */
const chatMatches = (session: SessionSummary, needle: string): boolean =>
	`${session.name ?? ""}\n${session.firstMessage}`.toLowerCase().includes(needle);

const filteredChats = (
	chats: ReadonlyArray<SessionSummary>,
	needle: string,
): ReadonlyArray<SessionSummary> =>
	needle === "" ? chats : chats.filter((chat) => chatMatches(chat, needle));

/** A project matches its folder name; one that does keeps every chat it holds. */
const filteredProjects = (
	entries: ReadonlyArray<ProjectSessions>,
	needle: string,
): ReadonlyArray<ProjectSessions> =>
	needle === ""
		? entries
		: entries
				.map((entry) =>
					entry.project.name.toLowerCase().includes(needle)
						? entry
						: { ...entry, sessions: filteredChats(entry.sessions, needle) },
				)
				.filter((entry) => entry.sessions.length > 0);

/** The search box and what it leaves of the project and chat lists. */
export function useSidebarFilter(
	projects: ReadonlyArray<ProjectSessions>,
	chats: ReadonlyArray<SessionSummary>,
) {
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const searching = needle !== "";
	const matchedProjects = filteredProjects(projects, needle);
	const matchedChats = filteredChats(chats, needle);
	const noMatches = searching && matchedProjects.length === 0 && matchedChats.length === 0;
	const showProjects = !searching || matchedProjects.length > 0;
	const showChats = !searching || matchedChats.length > 0;
	return {
		matchedChats,
		matchedProjects,
		noMatches,
		query,
		searching,
		setQuery,
		showChats,
		showProjects,
	};
}
