import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
	assistantEntry,
	linearSession,
	sessionHeader,
	userEntry,
	writeSession,
} from "../sessions.ts";
import { expect, test } from "./fixture.ts";

/**
 * Six user turns followed by sixty assistant rows: the newest fifty-row window contains no
 * user message, which used to hide the rail completely.
 */
const userPacedSession = (id: string, cwd: string): string => {
	const lines = [sessionHeader(id, cwd)];
	let parent: string | null = null;
	for (let turn = 0; turn < 6; turn++) {
		const entry = userEntry(`u${turn}`, parent, `user turn ${turn}`, turn * 2);
		lines.push(JSON.stringify(entry));
		parent = entry.id;
	}
	for (let answer = 0; answer < 60; answer++) {
		const entry = assistantEntry(`a${answer}`, parent, `answer ${answer}`, 20 + answer);
		lines.push(JSON.stringify(entry));
		parent = entry.id;
	}
	return `${lines.join("\n")}\n`;
};

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

/** Six short turns, so the last one and the one before it share the viewport at the end. */
const shortTurnsSession = (id: string, cwd: string): string => {
	const lines = [sessionHeader(id, cwd)];
	let parent: string | null = null;
	for (let turn = 0; turn < 6; turn++) {
		const user = userEntry(`u${turn}`, parent, `turn ${turn}`, turn * 2);
		lines.push(JSON.stringify(user));
		const answer = assistantEntry(`a${turn}`, user.id, `answer ${turn}`, turn * 2 + 1);
		lines.push(JSON.stringify(answer));
		parent = answer.id;
	}
	return `${lines.join("\n")}\n`;
};

test("the rail marks the newest turn when the chat opens at its end", async ({
	agentHome,
	app,
	page,
	projectsRoot,
}) => {
	const project = join(projectsRoot, "rail-end-project");
	mkdirSync(project, { recursive: true });
	writeSession(
		`${agentHome}/sessions/--rail-end--`,
		"rail-end",
		shortTurnsSession("rail-end", project),
	);

	await page.goto(app.url);
	await page.getByRole("button", { name: "rail-end-project", exact: true }).click();
	await page.getByRole("link", { name: /turn 0/ }).click();
	const rail = page.getByRole("navigation", { name: "Jump to a message" });
	await expect(rail).toBeVisible({ timeout: 10_000 });
	await expect(rail.getByRole("button", { name: /^Go to message \d+:/ })).toHaveCount(6);

	// The chat opens on its newest turn, so that turn is the one marked: the rows above the
	// fold belong to the turn before it.
	await expect(rail.getByRole("button", { name: /^Go to message 6:/ })).toHaveAttribute(
		"aria-current",
		"step",
	);
	await expect(rail.getByRole("button", { name: /^Go to message 1:/ })).not.toHaveAttribute(
		"aria-current",
		"step",
	);
});

test("the rail stays when the recent window has no user turn", async ({
	agentHome,
	app,
	page,
	projectsRoot,
}) => {
	const project = join(projectsRoot, "rail-project");
	mkdirSync(project, { recursive: true });
	writeSession(`${agentHome}/sessions/--rail-window--`, "rail", userPacedSession("rail", project));

	await page.goto(app.url);
	await page.getByRole("button", { name: "rail-project", exact: true }).click();
	await page.getByRole("link", { name: /user turn 0/ }).click();
	const transcript = page.getByRole("feed");
	await expect(transcript).toBeVisible();

	// The window has no user row, so the rail reads the branch tree and shows all six.
	const rail = page.getByRole("navigation", { name: "Jump to a message" });
	await expect(rail).toBeVisible({ timeout: 10_000 });
	await expect(rail.getByRole("button", { name: /^Go to message \d+:/ })).toHaveCount(6);

	// The chat opens on its newest turn, so the rail marks that turn, not the one whose
	// rows happen to sit above the fold.
	await expect(rail.getByRole("button", { name: /^Go to message 6:/ })).toHaveAttribute(
		"aria-current",
		"step",
	);

	// A dot for a turn older than the window loads the history page that holds it.
	await rail.getByRole("button", { name: /Go to message 1: user turn 0/ }).click();
	await expect(transcript.getByText("user turn 0", { exact: true })).toBeVisible({
		timeout: 10_000,
	});
});

test("an older page arrives without moving what the reader is reading", async ({
	agentHome,
	app,
	page,
	projectsRoot,
}) => {
	const project = join(projectsRoot, "page-project");
	mkdirSync(project, { recursive: true });
	writeSession(
		`${agentHome}/sessions/--page-window--`,
		"page",
		linearSession("page", project, 120),
	);

	await page.goto(app.url);
	await page.getByRole("button", { name: "page-project", exact: true }).click();
	await page.getByRole("link", { name: /prompt 0/ }).click();
	const transcript = page.getByRole("feed");
	await expect(transcript).toBeVisible();

	/** The oldest mounted row; a page landing above the reader changes it. */
	const windowStart = (): Promise<string | null> =>
		page.locator("[data-row-id]").first().getAttribute("data-row-id");

	const before = await windowStart();
	// The reader's own wheel to the top is what asks for the page. One gesture: the window
	// is a few screens tall, and a second wheel would carry the reader into the new page.
	await transcript.hover();
	await page.mouse.wheel(0, -20_000);
	await expect.poll(windowStart, { timeout: 8_000 }).not.toBe(before);

	// The page landed above the fold and the reader kept their place: the row they were on
	// is still on screen, not a page below it.
	await expect(page.locator(`[data-row-id="${String(before)}"]`)).toBeInViewport();
});
