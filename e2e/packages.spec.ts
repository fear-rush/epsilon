import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./support/test";
import { AGENT_HOME, LOCAL_PACKAGE } from "./support/home";

const settingsFile = join(AGENT_HOME, "settings.json");

const packagesConfigured = async (): Promise<boolean> => {
	// SAFETY: pi's settings writer wrote this file; only the packages array is read.
	const parsed = JSON.parse(await readFile(settingsFile, "utf8").catch(() => "{}")) as {
		packages?: unknown[];
	};
	return (parsed.packages ?? []).length > 0;
};

/** A local package needs no network: remove it, then install it again from the same path. */
test.describe("packages", () => {
	test("remove the local package and install it again", async ({ page }) => {
		await page.goto("/settings/packages");
		await page.getByRole("link", { name: /e2e-package/ }).click();
		await expect(page).toHaveTitle(/e2e-package/);
		await expect(page.getByText("package-skill")).toBeVisible();

		await page.getByRole("button", { name: "Remove package" }).click();
		await expect(page.getByRole("alertdialog", { name: /Remove .*e2e-package/ })).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL(/\/settings\/packages/);
		await expect(page.getByText("No packages installed")).toBeVisible();
		await expect.poll(packagesConfigured).toBe(false);

		await page.getByRole("button", { name: "Install package" }).click();
		await page.getByRole("textbox", { name: "Source" }).fill(LOCAL_PACKAGE);
		await page.getByRole("button", { name: "Install" }).click();

		await expect(page.getByRole("link", { name: /e2e-package/ })).toBeVisible();
		await expect.poll(packagesConfigured).toBe(true);
		await page.getByRole("link", { name: /e2e-package/ }).click();
		await expect(page.getByText("package-skill")).toBeVisible();
	});
});
