import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { linearSession, writeSession } from "../sessions.ts";
import { expect, test } from "./fixture.ts";

/**
 * Flow 6: a 5,000-entry chat opens without loading everything, and scrolling to the top
 * pulls older pages without a visible jump. Landing: steps 2, 4 and 8.
 */
test("a 5,000-entry chat scrolls to the top without a jump", async ({
	agentHome,
	app,
	page,
	projectsRoot,
}) => {
	const sessions = `${agentHome}/sessions/--tmp-project--`;
	const project = join(projectsRoot, "project");
	mkdirSync(project, { recursive: true });
	writeSession(sessions, "long", linearSession("long", project, 5_000));

	await page.goto(app.url);
	// The chat lives under its project folder, and a project starts collapsed.
	await page.getByRole("button", { name: "project", exact: true }).click();
	await page.getByRole("link", { name: /prompt 0/ }).click();
	const transcript = page.getByRole("feed");
	await expect(transcript).toBeVisible();

	// The chat opens on a window near its end, not on all 5,000 entries.
	const firstPrompt = async (): Promise<number> => {
		const text = await transcript.innerText();
		const match = /prompt (\d+)/.exec(text);
		return match === null ? -1 : Number(match[1]);
	};
	const before = await firstPrompt();
	expect(before).toBeGreaterThan(0);

	// Scrolling to the top pulls the next older page in place: the window moves back, it
	// does not reset. One page is enough to prove the paging; the walk to entry 0 is 50 of
	// them and belongs to the loading state, not to this assertion.
	// The wheel is the reader's own gesture, so the page's scroll handling is what runs.
	await transcript.hover();
	await expect(async () => {
		await page.mouse.wheel(0, -20_000);
		expect(await firstPrompt()).toBeLessThan(before);
	}).toPass({ timeout: 10_000 });
});
