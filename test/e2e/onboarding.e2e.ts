import { expect, test } from "./fixture.ts";

// The point of this flow is a home with nothing configured, so no stub model is written.
test.use({ withModel: false });

/**
 * Flow 1: an empty home reports what is missing, and adding the stub provider makes it
 * ready. Landing: step 6 (readiness) with step 8 (settings UI).
 */
test("an empty home shows readiness, and a provider makes it ready", async ({ app, page }) => {
	await page.goto(app.url);

	await expect(page.getByRole("status")).toContainText(/not ready|no model/i);

	await page.getByRole("button", { name: "App menu" }).click();
	await page.getByRole("menuitem", { name: /providers/i }).click();
	// The footer's Add provider is a menu: one way in for a key, one for an account.
	await page.getByRole("button", { name: /add provider/i }).click();
	await page.getByRole("menuitem", { name: /with an api key/i }).click();
	// The dialog lists the providers a key can be entered for; the first row defines one.
	await page.getByRole("button", { name: /custom provider/i }).click();
	await page.getByLabel("Display name").fill("Stub");
	await page.getByLabel("Base URL").fill(`${app.url}/v1`);
	await page.getByLabel("API key").fill("stub-key");
	// The stub server speaks OpenAI's chat completion shape, which the model dialog reads
	// its fields from.
	await page.locator("#provider-api").click();
	await page.getByRole("option", { name: /openai chat completions/i }).click();
	// A provider with no model cannot run a turn, so the stub model is part of the setup.
	await page.getByRole("button", { name: /add model/i }).click();
	const model = page.getByRole("dialog");
	await model.getByLabel("Model id").fill("stub-model");
	await model.getByRole("button", { name: "Save model" }).click();
	await expect(model).toBeHidden();
	await page.getByRole("button", { name: "Save", exact: true }).click();

	await page.getByRole("link", { name: /back to app/i }).click();
	await expect(page.getByRole("status")).toContainText(/ready/i);

	// The Status row counts what can run a turn, not pi's whole catalog: one stub model.
	await page.goto(`${app.url}/settings/general`);
	await expect(page.getByText("1 models can run a turn.")).toBeVisible();
});
