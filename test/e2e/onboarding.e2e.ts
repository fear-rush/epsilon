import { expect, test } from "./fixture.ts";

/**
 * Flow 1: an empty home reports what is missing, and adding the stub provider makes it
 * ready. Landing: step 6 (readiness) with step 8 (settings UI).
 */
test("an empty home shows readiness, and a provider makes it ready", async ({ app, page }) => {
	await page.goto(app.url);

	await expect(page.getByRole("status")).toContainText(/not ready|no model/i);

	await page.getByRole("link", { name: /settings/i }).click();
	await page.getByRole("link", { name: /providers/i }).click();
	await page.getByRole("button", { name: /add provider/i }).click();
	await page.getByLabel(/base url/i).fill(`${app.url}/v1`);
	await page.getByLabel(/api key/i).fill("stub-key");
	await page.getByLabel(/model/i).fill("stub-model");
	await page.getByRole("button", { name: /save/i }).click();

	await page.getByRole("link", { name: /chats/i }).click();
	await expect(page.getByRole("status")).toContainText(/ready/i);
});
