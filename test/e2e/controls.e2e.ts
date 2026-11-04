import { expect, test } from "./fixture.ts";

/**
 * The session controls are pi's own knobs: a model switch, a thinking level, the tools
 * declared to the model, and manual compaction. Every value shown is the engine's answer.
 */
test("the session controls switch model, thinking and tools, and compact refuses a tiny chat", async ({
	app,
	page,
}) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("hello controls");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	await page.getByRole("button", { name: "Session settings" }).click();
	const dialog = page.getByRole("dialog");

	await dialog.getByRole("button", { name: /Stub Model Two/ }).click();
	// pi's model switch also chooses the thinking level, so wait for it before overriding it.
	await expect(dialog.getByRole("button", { name: /Stub Model Two/ })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await dialog.getByRole("button", { name: "high", exact: true }).click();
	await expect(dialog.getByRole("button", { name: "high", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await dialog.getByRole("checkbox", { name: "Use bash" }).click();
	await expect(dialog.getByRole("checkbox", { name: "Use bash" })).not.toBeChecked();

	await dialog.getByRole("button", { name: "Compact this chat" }).click();
	await expect(dialog.getByText(/nothing to compact/i)).toBeVisible();

	await dialog.getByRole("button", { name: "Done" }).click();
	await expect(page.getByText(/stub-model-2 · high/)).toBeVisible();
});

/** A tree move stays in the same file: the leaf goes back and the message returns. */
test("the tree dialog moves the branch and restores the message", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("branch me");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	await page.getByRole("button", { name: "Branch tree" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: /^branch me user$/ }).click();

	await expect(composer).toHaveValue("branch me");
	await expect(page.getByText("stub reply")).toHaveCount(0);
});

/** A fork writes a new session file; the page follows the id the file now carries. */
test("a fork copies the branch into a new chat", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("fork me");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	const before = page.url();
	await page.getByRole("button", { name: "Branch tree" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /Fork from fork me/ })
		.click();

	await expect(page).not.toHaveURL(before);
	await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
	await expect(page.getByText("stub reply")).toHaveCount(0);
	await expect(page.getByRole("textbox", { name: /message/i })).toHaveValue("fork me");
});
