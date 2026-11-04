import { expect, test } from "./fixture.ts";

/**
 * Flow 4: killing the engine shows a notice in that chat only, and sending again
 * respawns it from the JSONL. Landing: step 5 (supervisor) with step 8 (diagnostics).
 */
test("a killed engine shows a notice and respawns on the next prompt", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();
	await page.getByRole("textbox", { name: /message/i }).fill("first turn");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	await page.getByRole("button", { name: "App menu" }).click();
	await page.getByRole("menuitem", { name: /diagnostics/i }).click();
	await page
		.getByRole("button", { name: /stop engine/i })
		.first()
		.click();

	await page.getByRole("link", { name: /chats/i }).click();
	await expect(page.getByRole("status")).toContainText(/engine stopped|no engine/i);

	await page.getByRole("textbox", { name: /message/i }).fill("second turn");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");
	await expect(page.getByText("stub reply").last()).toBeVisible();
});
