import { expect, test } from "./fixture.ts";

/**
 * An address nothing serves is an answer, not a crash: it says so in the product's words,
 * and inside a layout the navigation around it stays so the reader can leave.
 */
test("an unknown settings address keeps the settings navigation", async ({ app, page }) => {
	await page.goto(`${app.url}/settings/does-not-exist`);

	await expect(page.getByLabel("Search settings")).toBeVisible();
	await expect(page.getByText("This page does not exist")).toBeVisible();
	await expect(page.getByRole("link", { name: "Back to the app" })).toBeVisible();
});

test("an unknown address outside the layouts still says the page does not exist", async ({
	app,
	page,
}) => {
	await page.goto(`${app.url}/does-not-exist`);

	await expect(page.getByText("This page does not exist")).toBeVisible();
});
