import { writeSession, linearSession } from "../sessions.ts";
import { expect, test } from "./fixture.ts";

/**
 * Flow 5: dropping the socket shows a banner, and reconnecting restores the transcript.
 * Landing: step 8 (runtime reconnect) with step 7 (serve).
 */
test("a dropped socket shows a banner and recovers", async ({ app, page }) => {
	await page.goto(app.url);
	// The first connection is not a reconnect: a fresh load never says so.
	await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
	await expect(page.getByText(/reconnecting/i)).toHaveCount(0);
	await page.getByRole("button", { name: /new chat/i }).click();
	await page.getByRole("textbox", { name: /message/i }).fill("before the drop");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	app.stop();
	await expect(page.getByRole("status")).toContainText(/reconnecting|disconnected/i);
});

/**
 * F8f: a message typed while the server is gone is refused visibly, not lost in silence.
 *
 * The chat exists on disk, so nothing is mid-write. The page waits its reconnect deadline,
 * says the message was not sent in the composer's own words, and once the server returns the
 * chat subscribes again and the next message is delivered.
 */
test("a message typed while the server is down is refused visibly, and the chat recovers", async ({
	agentHome,
	app,
	page,
}) => {
	test.setTimeout(40_000);
	writeSession(`${agentHome}/sessions/--before--`, "before", linearSession("before", agentHome, 1));

	await page.goto(app.url);
	await page
		.getByRole("link", { name: /prompt 0|before/i })
		.first()
		.click();
	await expect(page.getByText("prompt 0")).toBeVisible();

	app.stop();
	await expect(page.getByRole("status")).toContainText(/reconnecting|disconnected/i);

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("during the drop");
	await composer.press("Enter");
	await expect(page.getByText("The message was not sent")).toBeVisible({ timeout: 15_000 });

	await app.restart();
	// A healthy app draws no status line; the banner's absence is the recovered signal.
	await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });

	await composer.fill("after the restart");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible({ timeout: 15_000 });
});
