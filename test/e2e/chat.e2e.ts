import { expect, test } from "./fixture.ts";

/**
 * Flow 2: a prompt streams a reply, and the chat survives a page reload because the
 * JSONL is the truth. Landing: steps 5 and 8.
 */
test("a prompt streams a reply and the chat survives a reload", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("hello there");
	await composer.press("Enter");

	await expect(page.getByText("stub reply")).toBeVisible();

	await page.reload();
	await expect(page.getByRole("link", { name: /hello there|new chat/i })).toBeVisible();
	await page
		.getByRole("link", { name: /hello there|new chat/i })
		.first()
		.click();
	await expect(page.getByText("stub reply")).toBeVisible();
});
