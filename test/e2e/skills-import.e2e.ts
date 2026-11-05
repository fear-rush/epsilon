import { strToU8, zipSync } from "fflate";

import { expect, test } from "./fixture.ts";

/**
 * Settings → Skills → Import: a zip archive is staged, reviewed and copied into the
 * agent home, and the skill list shows it afterwards.
 */
test("a zipped skill is imported through the wizard", async ({ app, page }) => {
	const archive = zipSync({
		"test-skill/SKILL.md": strToU8(
			"---\nname: test-skill\ndescription: A skill from the archive.\n---\n\n# Test skill\n\nSay hello.\n",
		),
	});

	await page.goto(app.url);
	await page.getByRole("button", { name: "App menu" }).click();
	await page.getByRole("menuitem", { name: /skills/i }).click();

	await page.getByRole("button", { name: /^import$/i }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	// The source step picks a folder, an archive or a pasted `skills add` line.
	await dialog.getByRole("tab", { name: /archive/i }).click();
	await dialog.locator('input[accept*="zip"]').setInputFiles({
		buffer: Buffer.from(archive),
		mimeType: "application/zip",
		name: "skills.zip",
	});

	// The archive is staged, then reviewed: the wizard shows what it would install.
	await dialog.getByRole("button", { name: /^continue$/i }).click();
	await expect(dialog.getByText("test-skill", { exact: true }).first()).toBeVisible();
	await dialog.getByRole("button", { name: /^install$/i }).click();

	// The dialog closes and the list reads the new skill from the home.
	await expect(dialog).toBeHidden();
	await expect(page.getByRole("link", { name: /test-skill/ })).toBeVisible();
});
