import { existsSync } from "node:fs";

import { expect, test } from "./support/test";
import { query, trustProject } from "./support/app";
import { PROJECT, PROJECT_TWO, PROJECT_TWO_CHAT_ID } from "./support/home";

/** Project trust, the folder picker, and taking a project off the list. */
test.describe.serial("projects", () => {
	test("the trust gate opens an untrusted project", async ({ page }) => {
		await page.goto(`/sessions/${PROJECT_TWO_CHAT_ID}?project=${query(PROJECT_TWO)}`);
		// A project session shows the inline gate; the folder picker opens a dialog.
		await expect(page.getByText("Trust project-two?")).toBeVisible();
		await expect(page.getByText(/\/project-two$/)).toBeVisible();

		await page.getByRole("button", { name: "Trust folder" }).click();
		await expect(page.getByText("This one runs in the second project.")).toBeVisible();
		await expect(page).toHaveURL(
			(url) =>
				url.pathname.endsWith(PROJECT_TWO_CHAT_ID) &&
				url.searchParams.get("project") === PROJECT_TWO,
		);

		await page.goto(`/settings/skills?project=${query(PROJECT_TWO)}`);
		await expect(page.getByRole("tab", { name: "Project" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /second-skill/ })).toBeVisible();
	});

	test("the folder picker opens a trusted project", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto("/");
		await page.getByRole("button", { name: "Open project" }).click();
		const dialog = page.getByRole("dialog", { name: "Open a project" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/epsilon-e2e\/user/).first()).toBeVisible();

		await dialog.getByRole("button", { name: /^project \// }).click();
		await page.getByRole("button", { name: "Open this folder" }).click();

		await expect(page).toHaveURL(
			(url) =>
				url.pathname.startsWith("/sessions/") &&
				url.searchParams.get("project")?.endsWith("/user/project") === true,
		);
		await expect(page.getByText(/epsilon-e2e\/user\/project$/).first()).toBeVisible();
	});

	test("removing a project deletes its chats but keeps its folder", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "project-two", exact: true }).click();
		await page.getByRole("button", { name: "project-two actions" }).click();
		await page.getByRole("menuitem", { name: "Remove from Epsilon" }).click();
		await expect(
			page.getByRole("alertdialog", { name: "Remove project-two from Epsilon?" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();

		await expect(page.getByRole("button", { name: "project-two", exact: true })).toHaveCount(0);
		await expect(page.getByRole("link", { name: /Second project chat/ })).toHaveCount(0);
		expect(existsSync(PROJECT_TWO)).toBe(true);
	});
});
