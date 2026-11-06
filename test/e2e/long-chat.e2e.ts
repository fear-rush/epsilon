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

	// The jump rail owns a gutter to the left of the feed: its dots must never sit over text.
	const rail = page.getByRole("navigation", { name: "Jump to a message" });
	await expect(rail).toBeVisible();
	const [feedBox, railBox] = await Promise.all([transcript.boundingBox(), rail.boundingBox()]);
	expect(feedBox).not.toBeNull();
	expect(railBox).not.toBeNull();
	if (feedBox !== null && railBox !== null) {
		expect(railBox.x + railBox.width).toBeLessThanOrEqual(feedBox.x + 1);
	}

	// One dot marks the current turn and stays in the five-slot window even in a long chat.
	// Hovering another never darkens it, so a scroll or a jump cannot draw a second dark dot.
	const activeMarker = rail.locator('[data-rail-active="true"]');
	await expect(activeMarker).toHaveCount(1);
	const viewport = rail.locator('[data-rail-viewport="true"]');
	// The rail smooth-follows like main; wait for the active dot to settle in view.
	await expect
		.poll(async () => {
			const [viewportBox, markerBox] = await Promise.all([
				viewport.boundingBox(),
				activeMarker.boundingBox(),
			]);
			if (viewportBox === null || markerBox === null) return false;
			return (
				markerBox.y >= viewportBox.y - 1 &&
				markerBox.y + markerBox.height <= viewportBox.y + viewportBox.height + 1
			);
		})
		.toBe(true);
	const viewportBox = await viewport.boundingBox();
	expect(viewportBox).not.toBeNull();
	// Hover a dot inside the five-slot window, not an off-screen one that Playwright would
	// scroll into view first.
	const buttons = rail.locator('button[aria-label^="Go to message"]');
	const buttonCount = await buttons.count();
	const elements = Array.from({ length: buttonCount }, (_, index) => buttons.nth(index));
	const [currents, boxes] = await Promise.all([
		Promise.all(elements.map((button) => button.getAttribute("aria-current"))),
		Promise.all(elements.map((button) => button.boundingBox())),
	]);
	const idleIndex = boxes.findIndex((box, index) => {
		if (currents[index] === "step" || box === null || viewportBox === null) return false;
		return box.y >= viewportBox.y && box.y + box.height <= viewportBox.y + viewportBox.height;
	});
	expect(idleIndex).toBeGreaterThanOrEqual(0);
	const idle = rail.locator('button[aria-label^="Go to message"]').nth(idleIndex);
	await idle.hover();
	await expect(idle.locator("span")).not.toHaveClass(/bg-foreground/);

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
	await expect(rail.locator('[data-rail-active="true"]')).toHaveCount(1);

	// A dot for a turn older than the window loads the history page that holds it.
	await rail.getByRole("button", { name: /Go to message 1: user turn 0/ }).click();
	await expect(transcript.getByText("user turn 0", { exact: true })).toBeVisible({
		timeout: 10_000,
	});
});
