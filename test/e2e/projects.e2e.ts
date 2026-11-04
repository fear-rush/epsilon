import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixture.ts";

/**
 * A folder with its own pi resources stays shut until the operator trusts it, then a chat
 * runs there and the projects page reports the decision.
 */
test("an untrusted project folder is gated, then a chat runs in it", async ({
	app,
	page,
	projectsRoot,
}) => {
	const folder = join(projectsRoot, "gated-project");
	mkdirSync(join(folder, ".pi"), { recursive: true });
	writeFileSync(join(folder, ".pi", "settings.json"), "{}\n");

	await page.goto(`${app.url}/settings/projects`);
	await page.getByRole("button", { name: /open folder/i }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "gated-project" }).click();
	await dialog.getByRole("button", { name: "Use this folder" }).click();

	await expect(page.getByText("This folder is not trusted")).toBeVisible();
	const composer = page.getByRole("textbox", { name: /message/i });
	await expect(composer).toHaveCount(0);

	await page.getByRole("button", { name: "Trust this folder" }).click();
	await expect(composer).toBeVisible();

	await composer.fill("hello from the project");
	await composer.press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	await page.goto(`${app.url}/settings/projects`);
	await expect(page.getByText("gated-project", { exact: true })).toBeVisible();
	await expect(page.getByText("Trusted", { exact: true })).toBeVisible();
});
