import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { sessionHeader, userEntry, writeSession } from "../sessions.ts";
import { expect, test } from "./fixture.ts";

/**
 * The sidebar shows one page of each list, ordered by the newest chat in the folder, and
 * one page of chats inside an expanded project. Search reads the whole list, so an old
 * chat is one query away rather than one page away.
 */

/** The folder pi itself would use for a cwd's session files. */
const sessionDirFor = (agentHome: string, cwd: string): string =>
	join(agentHome, "sessions", `--${cwd.replace(/^[/\\]/, "").replaceAll(/[/\\:]/g, "-")}--`);

/** One user message, whose timestamp is the chat's activity. */
const chat = (id: string, cwd: string, label: string, index: number): string =>
	`${sessionHeader(id, cwd)}\n${JSON.stringify(userEntry("e1", null, label, index))}\n`;

const seed = (agentHome: string, root: string): void => {
	for (let number = 1; number <= 12; number++) {
		const name = `p${String(number).padStart(2, "0")}`;
		const folder = join(root, name);
		mkdirSync(folder, { recursive: true });
		// One project holds a full page of its own, so its Load more is real.
		const count = number === 12 ? 12 : 1;
		for (let at = 1; at <= count; at++) {
			const id = `p${number}-${at}`;
			const label =
				number === 12 ? `p12 message ${String(at).padStart(2, "0")}` : `${name} message`;
			writeSession(
				sessionDirFor(agentHome, folder),
				id,
				chat(id, folder, label, number === 12 ? 100 + at : number),
			);
		}
	}

	const chatsDir = join(agentHome, "chats");
	mkdirSync(chatsDir, { recursive: true });
	for (let number = 1; number <= 12; number++) {
		const id = `c${number}`;
		writeSession(
			sessionDirFor(agentHome, chatsDir),
			id,
			chat(id, chatsDir, `global ${String(number).padStart(2, "0")}`, 200 + number),
		);
	}
};

test("the sidebar pages projects and chats", async ({ app, agentHome, page, projectsRoot }) => {
	// The server resolves a project to its real path; seed the real one so the rows and
	// the status answer agree.
	seed(agentHome, realpathSync(projectsRoot));
	await page.goto(app.url);

	const sidebar = page.locator('[data-sidebar="sidebar"]').first();
	await expect(sidebar.getByText("Projects", { exact: true })).toBeVisible();

	// Ten newest folders, in activity order, and the eleventh is not mounted.
	expect(await sidebar.getByRole("button", { name: /^p\d{2}$/ }).allTextContents()).toEqual([
		"p12",
		"p11",
		"p10",
		"p09",
		"p08",
		"p07",
		"p06",
		"p05",
		"p04",
		"p03",
	]);
	await expect(sidebar.getByText("global 12", { exact: true })).toBeVisible();
	await expect(sidebar.getByText("global 02", { exact: true })).toHaveCount(0);

	await sidebar.getByRole("button", { name: "Load more projects", exact: true }).click();
	await expect(sidebar.getByRole("button", { name: "p02", exact: true })).toBeVisible();
	await expect(sidebar.getByRole("button", { name: "p01", exact: true })).toBeVisible();

	await sidebar.getByRole("button", { name: "Load more chats", exact: true }).click();
	await expect(sidebar.getByText("global 02", { exact: true })).toBeVisible();

	// One project's own chats page too: p12 holds twelve.
	await sidebar.getByRole("button", { name: "p12", exact: true }).click();
	await expect(sidebar.getByText("p12 message 10", { exact: true })).toBeVisible();
	await expect(sidebar.getByText("p12 message 02", { exact: true })).toHaveCount(0);
	await sidebar.getByRole("button", { name: "Load more chats in p12", exact: true }).click();
	await expect(sidebar.getByText("p12 message 02", { exact: true })).toBeVisible();

	// Search is not paged: p01 is past the first page, and one query finds it.
	const search = sidebar.getByRole("textbox", { name: "Search chats" });
	await search.fill("p01");
	await expect(sidebar.getByRole("button", { name: "p01", exact: true })).toBeVisible();
	await expect(sidebar.getByText("p01 message", { exact: true })).toBeVisible();
	await search.fill("");

	// The removed group is gone from the column.
	await expect(sidebar.getByText("Missing folders", { exact: true })).toHaveCount(0);
});
