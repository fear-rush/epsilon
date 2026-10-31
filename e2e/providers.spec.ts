import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./support/test";
import { AGENT_HOME } from "./support/home";

const models = join(AGENT_HOME, "models.json");

/** The provider editor's writes and its error states. */
test.describe("providers editor", () => {
	test.use({ consoleErrors: "ignore" });
	test("an empty new provider shows every field error", async ({ page }) => {
		await page.goto("/settings/providers/new");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByText("A provider needs a name.")).toBeVisible();
		await expect(page.getByText("A custom provider needs a base URL.")).toBeVisible();
		await expect(page.getByText("Choose the API family this provider speaks.")).toBeVisible();
		await expect(page).toHaveURL(/\/settings\/providers\/new$/);
	});

	test("a failed connection test is shown in the page", async ({ page }) => {
		await page.goto("/settings/providers/e2e");
		await page.getByRole("button", { name: "Test a model" }).click();
		await page.getByRole("option", { name: /E2E Model/ }).click();

		const notice = page.getByRole("alert").filter({ hasText: /./ }).first();
		await expect(notice).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText(/E2E|connect|failed|refused|reach|error/i).first()).toBeVisible();
	});

	test("delete removes the provider from models.json", async ({ page }) => {
		await page.goto("/settings/providers/e2e-delete");
		await expect(page.getByRole("heading", { name: "Delete Provider" })).toBeVisible();
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await expect(page.getByRole("alertdialog", { name: "Remove Delete Provider?" })).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();

		await expect(page).toHaveURL(/\/settings\/providers$/);
		await expect(page.getByRole("link", { name: /Delete Provider/ })).toHaveCount(0);
		await expect
			.poll(async () => readFile(models, "utf8").catch(() => ""))
			.not.toContain("e2e-delete");
	});
});
