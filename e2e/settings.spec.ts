import { expect, test } from "./support/test";

import { query, trustProject } from "./support/app";
import { PROJECT } from "./support/home";

/** The configuration surface, its lists, and the forms that write pi's files. */
test.describe("settings", () => {
	test("the settings search filters the sections", async ({ page }) => {
		await page.goto("/settings/general");
		const search = page.getByRole("textbox", { name: "Search settings" });
		await search.fill("prov");
		await expect(page.getByRole("link", { name: "Providers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "MCP servers" })).toHaveCount(0);

		await search.fill("nothing-matches");
		await expect(page.getByText("No matching section.")).toBeVisible();
	});

	test("the providers list opens the seeded provider", async ({ page }) => {
		await page.goto("/settings/providers");
		await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
		await page.getByRole("link", { name: /E2E Provider/ }).click();

		await expect(page).toHaveURL(/\/settings\/providers\/e2e$/);
		await expect(page).toHaveTitle("e2e · Providers · Settings");
		await expect(page.getByRole("heading", { name: "E2E Provider" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("E2E Provider");
		await expect(page.getByRole("textbox", { name: "Base URL" })).toHaveValue(
			"http://127.0.0.1:9/v1",
		);
	});

	test("an unsaved provider stays on Stay and reverts on Discard", async ({ page }) => {
		await page.goto("/settings/providers/e2e");
		const name = page.getByRole("textbox", { name: "Display name" });
		await expect(name).toHaveValue("E2E Provider");
		await name.fill("E2E Provider edited");

		await page.getByRole("link", { name: "General" }).click();
		await expect(page.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
		await page.getByRole("button", { name: "Stay" }).click();
		await expect(page).toHaveURL(/\/settings\/providers\/e2e$/);
		await expect(name).toHaveValue("E2E Provider edited");

		await page.getByRole("link", { name: "General" }).click();
		await page.getByRole("button", { name: "Discard changes" }).click();
		await expect(page).toHaveURL(/\/settings\/general$/);

		await page.goto("/settings/providers/e2e");
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("E2E Provider");
	});

	test("the new-provider page renders without a saved provider", async ({ page }) => {
		await page.goto("/settings/providers/new");
		await expect(page).toHaveTitle("New provider · Settings");
		await expect(page.getByRole("heading", { name: "New provider" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("");
		await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
	});

	test("the MCP list opens a disabled server and shows its entry", async ({ page }) => {
		await page.goto("/settings/mcp");
		await expect(page.getByRole("heading", { name: "MCP servers" })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-stdio/ })).toBeVisible();
		await page.getByRole("link", { name: /e2e-disabled/ }).click();

		await expect(page).toHaveURL(/\/settings\/mcp\/global\/e2e-disabled$/);
		await expect(page).toHaveTitle("e2e-disabled · MCP servers · Settings");
		await expect(page.getByRole("textbox", { name: "URL" })).toHaveValue("http://127.0.0.1:9/mcp");
		await expect(page.getByRole("switch", { name: "Enable e2e-disabled" })).not.toBeChecked();
	});

	test("the skills list shows the home, package and foreign skills", async ({ page }) => {
		await page.goto("/settings/skills");
		await expect(page.getByRole("link", { name: /e2e-skill/ })).toBeVisible();
		await expect(page.getByRole("link", { name: /package-skill/ })).toBeVisible();
		await expect(page.getByText(/foreign-skill/)).toBeVisible();
	});

	test("the skill tab and raw file live in the URL", async ({ page }) => {
		await page.goto("/settings/skills/e2e-skill?root=home");
		await expect(page).toHaveTitle("e2e-skill · Skills · Settings");
		await expect(page.getByRole("tab", { name: "Form" })).toHaveAttribute("aria-selected", "true");

		await page.getByRole("tab", { name: "Raw" }).click();
		await expect(page).toHaveURL(/tab=raw/);
		await page.getByRole("button", { name: "example.md" }).click();
		await expect(page).toHaveURL(/file=references%2Fexample.md/);
		await expect(page.getByRole("textbox", { name: "references/example.md" })).toContainText(
			"A reference file.",
		);

		await page.reload();
		await expect(page.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true");
		await expect(page.getByRole("textbox", { name: "references/example.md" })).toContainText(
			"A reference file.",
		);

		await page.getByRole("tab", { name: "Form" }).click();
		await expect(page).not.toHaveURL(/tab=raw/);
	});

	test("the packages list opens the local package and its resources", async ({ page }) => {
		await page.goto("/settings/packages");
		await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
		await page.getByRole("link", { name: /e2e-package/ }).click();

		await expect(page).toHaveURL(/\/settings\/packages\/user\//);
		await expect(page.getByRole("heading", { name: "e2e-package" }).first()).toBeVisible();
		await expect(page.getByText("package-skill")).toBeVisible();
	});

	test("a trusted project stays in the URL across settings sections", async ({ page }) => {
		await trustProject(page, PROJECT);

		await page.goto(`/settings/skills?project=${query(PROJECT)}`);
		await expect(page.getByRole("tab", { name: "Project" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /project-skill/ })).toBeVisible();

		await page.getByRole("link", { name: "MCP servers" }).first().click();
		await expect(page).toHaveURL(
			(url) => url.pathname === "/settings/mcp" && url.searchParams.get("project") === PROJECT,
		);
	});
});
