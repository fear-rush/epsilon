import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./support/test";
import { AGENT_HOME } from "./support/home";

const created = join(AGENT_HOME, "skills", "created-skill", "SKILL.md");

/** The skill editor is the only place that writes a skill's folder from the browser. */
test.describe("skills editor", () => {
	test("create a skill, save it, and find it on disk", async ({ page }) => {
		await page.goto("/settings/skills");
		await page.getByRole("link", { name: "Add skill" }).click();
		await expect(page).toHaveURL(/\/settings\/skills\/new\?root=home$/);

		await page.getByRole("textbox", { name: "Name" }).fill("created-skill");
		await page.getByRole("textbox", { name: "Description" }).fill("Created by the e2e suite.");
		await page
			.getByRole("textbox", { name: "Instructions" })
			.fill("# Created skill\n\nBody from the e2e suite.");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(page).toHaveURL(/\/settings\/skills\/created-skill\?root=home$/);
		await expect(page.getByRole("link", { name: /created-skill/ })).toBeVisible();
		await expect
			.poll(async () => readFile(created, "utf8").catch(() => ""))
			.toContain("Created by the e2e suite.");
	});

	test("the raw tab saves a file through the checked route", async ({ page }) => {
		await page.goto("/settings/skills/created-skill?root=home");
		await page.getByRole("tab", { name: "Raw" }).click();
		await expect(page).toHaveURL(/tab=raw/);

		const editor = page.getByRole("textbox", { name: "SKILL.md" });
		await editor.fill(
			"---\nname: created-skill\ndescription: Edited raw by the e2e suite.\n---\n\n# Raw body\n",
		);
		await page.getByRole("button", { name: "Save" }).click();
		await expect
			.poll(async () => readFile(created, "utf8").catch(() => ""))
			.toContain("Edited raw by the e2e suite.");

		await page.reload();
		await expect(editor).toContainText("Raw body");
	});

	test("the loaded switch writes pi's skill setting", async ({ page }) => {
		await page.goto("/settings/skills/created-skill?root=home");
		const toggle = page.getByRole("switch", { name: "created-skill" });
		await expect(toggle).toBeChecked();
		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await toggle.click();
		await expect(toggle).toBeChecked();
	});

	test("delete removes the skill folder", async ({ page }) => {
		await page.goto("/settings/skills/created-skill?root=home");
		await page.getByRole("button", { name: "Delete" }).click();
		await expect(page.getByRole("alertdialog", { name: "Remove created-skill?" })).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();

		await expect(page).toHaveURL(/\/settings\/skills$/);
		await expect(page.getByRole("link", { name: /created-skill/ })).toHaveCount(0);
		await expect.poll(() => existsSync(created)).toBe(false);
	});

	test("a skill with no description is shown as invalid, not hidden", async ({ page }) => {
		await page.goto("/settings/skills/broken-skill?root=home");
		await expect(page.getByRole("heading", { name: "broken-skill" })).toBeVisible();
		await expect(page.getByText(/description/i).first()).toBeVisible();
	});

	test("skill search filters the list", async ({ page }) => {
		await page.goto("/settings/skills");
		const search = page.getByRole("textbox", { name: "Search skills" });
		await search.fill("package");
		await expect(page.getByRole("link", { name: /package-skill/ })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-skill/ })).toHaveCount(0);

		await search.fill("nothing-matches");
		await expect(page.getByText("Nothing matches.")).toBeVisible();
	});
});
