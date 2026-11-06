import { expect, test } from "./fixture.ts";

/**
 * The session controls are pi's own knobs: a model switch, a thinking level, the tools
 * declared to the model, and manual compaction. Every value shown is the engine's answer.
 */
test("the composer's menus switch model, thinking and tools, and compact refuses a tiny chat", async ({
	app,
	page,
}) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("hello controls");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	// The model menu lists every model pi composed; picking one switches the chat.
	await page.getByRole("button", { name: "Stub Model" }).click();
	await page.getByRole("menuitemradio", { name: /Stub Model Two/ }).click();
	await expect(page.getByRole("button", { name: "Stub Model Two" })).toBeVisible();

	// The thinking menu shows pi's level and writes the one chosen.
	await page.getByRole("button", { name: /thinking level:/i }).click();
	await page.getByRole("menuitemradio", { name: "High" }).click();
	await expect(page.getByRole("button", { name: /thinking level: high/i })).toBeVisible();

	// The tools menu is pi's declared tool set: read only stops bash, edit and write.
	await page.getByRole("button", { name: /commands & edits/i }).click();
	await page.getByRole("menuitemradio", { name: /read only/i }).click();
	await expect(page.getByRole("button", { name: /read only/i })).toBeVisible();

	// Compaction is this chat's own control; a one-reply chat has nothing to compact, and
	// pi's refusal is what the page says.
	await page.getByRole("button", { name: "Session controls" }).click();
	await page.getByRole("menuitem", { name: /compact context/i }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: /^compact$/i }).click();
	// The refusal lands in the composer's own status, in pi's words.
	await expect(page.getByText(/nothing to compact/i).first()).toBeVisible();
});

/** A tree move stays in the same file: the leaf goes back and the message returns. */
test("the tree dialog moves the branch and restores the message", async ({ app, page }) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();

	const composer = page.getByRole("textbox", { name: /message/i });
	await composer.fill("branch me");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	// The branch tree hangs off the session's own menu.
	await page.getByRole("button", { name: "Session controls" }).click();
	await page.getByRole("menuitem", { name: /session tree/i }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: /branch me/ }).click();

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
	await page.getByRole("button", { name: "Session controls" }).click();
	await page.getByRole("menuitem", { name: /fork from a message/i }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /fork me/ })
		.click();

	await expect(page).not.toHaveURL(before);
	await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
	await expect(page.getByText("stub reply")).toHaveCount(0);
	await expect(page.getByRole("textbox", { name: /message/i })).toHaveValue("fork me");
});
