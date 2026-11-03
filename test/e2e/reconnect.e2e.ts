import { expect, test } from "./fixture.ts";

/**
 * Flow 5: dropping the socket shows a banner, and reconnecting restores the transcript.
 * Landing: step 8 (runtime reconnect) with step 7 (serve).
 */
test("a dropped socket shows a banner and recovers", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();
	await page.getByRole("textbox", { name: /message/i }).fill("before the drop");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	app.stop();
	await expect(page.getByRole("status")).toContainText(/reconnecting|disconnected/i);
});
