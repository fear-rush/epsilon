import { describe, expect, test } from "bun:test";

import type { SessionSummary } from "#protocol/sessions";

import { folderName, sidebarRows } from "./sidebar-rows.ts";

const chatsDir = "/home/chats";

const session = (id: string, cwd: string, pinned = false): SessionSummary => ({
	cwd,
	created: 0,
	firstMessage: id,
	id,
	lastActivity: 0,
	messageCount: 1,
	name: null,
	parentSession: null,
	pinned,
});

describe("sidebar rows", () => {
	test("a chat in the home folder is plain; another folder is a project", () => {
		const rows = sidebarRows(
			[session("a", chatsDir), session("b", "/work/repo"), session("c", "/work/repo")],
			chatsDir,
			new Set(),
		);

		expect(rows.map((row) => row.kind)).toEqual([
			"heading",
			"project",
			"chat",
			"chat",
			"heading",
			"chat",
		]);
		const project = rows[1];
		expect(project?.kind === "project" && project.label).toBe("repo");
		expect(project?.kind === "project" && project.count).toBe(2);
	});

	test("a collapsed project keeps its chats out of the list", () => {
		const rows = sidebarRows(
			[session("a", chatsDir), session("b", "/work/repo")],
			chatsDir,
			new Set(["/work/repo"]),
		);

		expect(rows.some((row) => row.kind === "chat" && row.session.id === "b")).toBe(false);
		const project = rows.find((row) => row.kind === "project");
		expect(project?.kind === "project" && project.open).toBe(false);
	});

	test("projects are ordered by their folder name", () => {
		const rows = sidebarRows(
			[session("a", "/work/zeta"), session("b", "/work/alpha")],
			chatsDir,
			new Set(),
		);
		const projects = rows.flatMap((row) => (row.kind === "project" ? [row.label] : []));
		expect(projects).toEqual(["alpha", "zeta"]);
	});

	test("a folder is called by its last segment", () => {
		expect(folderName("/work/repo")).toBe("repo");
		expect(folderName("/work/repo/")).toBe("repo");
	});
});
