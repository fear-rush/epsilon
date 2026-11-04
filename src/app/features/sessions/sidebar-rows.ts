import type { SessionSummary } from "#protocol/sessions";

/**
 * The chat column as one flat list of rows.
 *
 * A chat that ran in the agent home's own folder is a plain chat; every other chat belongs
 * to the folder it ran in, and that folder is a project group. Flattening means the list can
 * be virtualized without grouping components inside components, and a group is one row plus
 * its chats, so collapsing it is a filter, not a height animation.
 */
export type SidebarRow =
	| { readonly kind: "heading"; readonly key: string; readonly label: string }
	| {
			readonly kind: "project";
			readonly key: string;
			readonly folder: string;
			readonly label: string;
			readonly count: number;
			readonly open: boolean;
	  }
	| {
			readonly kind: "chat";
			readonly key: string;
			readonly session: SessionSummary;
			readonly project: string | undefined;
	  }
	| { readonly kind: "empty"; readonly key: string };

/** The last path segment, which is what a folder is called to a reader. */
export const folderName = (folder: string): string => {
	const parts = folder.split("/").filter((part) => part !== "");
	return parts.at(-1) ?? folder;
};

export function sidebarRows(
	sessions: ReadonlyArray<SessionSummary>,
	chatsDir: string | undefined,
	collapsed: ReadonlySet<string>,
): ReadonlyArray<SidebarRow> {
	const chats: SessionSummary[] = [];
	const projects = new Map<string, SessionSummary[]>();

	for (const session of sessions) {
		if (chatsDir !== undefined && session.cwd === chatsDir) {
			chats.push(session);
			continue;
		}
		const group = projects.get(session.cwd);
		if (group === undefined) projects.set(session.cwd, [session]);
		else group.push(session);
	}

	const rows: SidebarRow[] = [];
	const folders = [...projects.keys()].toSorted((left, right) =>
		folderName(left).localeCompare(folderName(right)),
	);
	if (folders.length > 0) {
		rows.push({ key: "h-projects", kind: "heading", label: "Projects" });
		for (const folder of folders) {
			const group = projects.get(folder) ?? [];
			const open = !collapsed.has(folder);
			rows.push({
				count: group.length,
				folder,
				key: `p:${folder}`,
				kind: "project",
				label: folderName(folder),
				open,
			});
			if (!open) continue;
			for (const session of group) {
				rows.push({ key: `c:${session.id}`, kind: "chat", project: folder, session });
			}
		}
	}

	rows.push({ key: "h-chats", kind: "heading", label: "Chats" });
	if (chats.length === 0) rows.push({ key: "empty", kind: "empty" });
	else
		for (const session of chats)
			rows.push({ key: `c:${session.id}`, kind: "chat", project: undefined, session });
	return rows;
}
