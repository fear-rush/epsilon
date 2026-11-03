import { expect, test } from "./fixture.ts";

/**
 * Flow 3: an extension dialog is answered in the page and the run continues.
 * Landing: step 5 (engine UI bridge) with step 8 (dialog rendering).
 */
test("an extension confirm dialog is answered and the run continues", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();
	await page.getByRole("textbox", { name: /message/i }).fill("run the extension");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: /confirm|yes/i }).click();

	await expect(page.getByText("stub reply")).toBeVisible();
});
