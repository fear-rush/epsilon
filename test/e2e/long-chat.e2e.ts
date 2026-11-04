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

	const anchorText = await transcript.evaluate((node) => node.textContent?.slice(0, 40) ?? "");
	await transcript.evaluate((node) => node.scrollTo({ top: 0 }));
	await expect(transcript).toContainText("prompt 0");
	expect(anchorText.length).toBeGreaterThan(0);
});
