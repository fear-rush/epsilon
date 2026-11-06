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
	const [viewportBox, markerBox] = await Promise.all([
		viewport.boundingBox(),
		activeMarker.boundingBox(),
	]);
	expect(viewportBox).not.toBeNull();
	expect(markerBox).not.toBeNull();
	if (viewportBox !== null && markerBox !== null) {
		expect(markerBox.y).toBeGreaterThanOrEqual(viewportBox.y - 1);
		expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(
			viewportBox.y + viewportBox.height + 1,
		);
	}
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
