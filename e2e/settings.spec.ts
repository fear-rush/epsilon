import { expect, test } from "./support/test";

import { query, readJson, trustProject } from "./support/app";
import {
	AGENT_HOME,
	LIVE,
	LIVE_MODEL,
	LIVE_MODEL_TWO,
	LIVE_REASON,
	PROJECT,
	SETTINGS_FILE,
} from "./support/home";

type SettingsFile = { defaultProvider?: string; defaultModel?: string };

const settingsFile = () => readJson<SettingsFile>(SETTINGS_FILE);

test.describe.serial("settings", () => {
	test("the search filters the sections, and an empty result says so", async ({ page }) => {
		await page.goto("/settings/general");
		const search = page.getByRole("textbox", { name: "Search settings" });
		await search.fill("prov");
		await expect(page.getByRole("link", { name: "Providers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "MCP servers" })).toHaveCount(0);

		await search.fill("pack");
		await expect(page.getByRole("link", { name: "Packages" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Providers" })).toHaveCount(0);

		await search.fill("nothing-matches");
		await expect(page.getByText("No matching section.")).toBeVisible();
		await page.getByRole("link", { name: "MCP servers" }).count();
		await search.fill("");
		await expect(page.getByRole("link", { name: "MCP servers" })).toBeVisible();
	});

	test("General names the home, its readiness, and the model a new chat starts on", async ({
		page,
	}) => {
		await page.goto("/settings/general");
		await expect(page).toHaveTitle("General · Settings");
		await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
		await expect(page.getByText("Status", { exact: true })).toBeVisible();
		await expect(page.getByText(/models can run a turn/u)).toBeVisible();
		await expect(page.getByText(AGENT_HOME, { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Default model" })).toContainText(
			LIVE ? "DeepSeek V4.1 Flash" : "Dead Model",
		);
	});

	test("the default model is written to settings.json and survives a reload", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/settings/general");
		await page.getByRole("button", { name: "Default model" }).click();
		const search = page.getByPlaceholder("Search models…");
		await search.fill("Qwen 3.7");
		await expect(page.getByText("No model matches.")).toHaveCount(0);
		await page
			.getByRole("group", { name: "commandcode" })
			.getByRole("option", { name: "Qwen 3.7 Flash" })
			.click();

		await expect(page.getByRole("button", { name: "Default model" })).toContainText(
			"Qwen 3.7 Flash",
		);
		await expect.poll(async () => (await settingsFile()).defaultModel).toBe(LIVE_MODEL_TWO);
		expect((await settingsFile()).defaultProvider).toBe("commandcode");

		await page.reload();
		await expect(page.getByRole("button", { name: "Default model" })).toContainText(
			"Qwen 3.7 Flash",
		);

		// Put the seeded default back for the specs that run after this one.
		await page.getByRole("button", { name: "Default model" }).click();
		await page.getByPlaceholder("Search models…").fill("DeepSeek V4.1");
		await page
			.getByRole("group", { name: "commandcode" })
			.getByRole("option", { name: "DeepSeek V4.1 Flash" })
			.click();
		await expect.poll(async () => (await settingsFile()).defaultModel).toBe(LIVE_MODEL);
	});

	test("the default model picker reports a search with no match", async ({ page }) => {
		await page.goto("/settings/general");
		await page.getByRole("button", { name: "Default model" }).click();
		await page.getByPlaceholder("Search models…").fill("zzz-no-model");
		await expect(page.getByText("No model matches.")).toBeVisible();
		await page.keyboard.press("Escape");
	});

	test("the current section is marked in the navigation", async ({ page }) => {
		await page.goto("/settings/skills");
		await expect(page.getByRole("link", { name: "Skills" }).first()).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(page.getByRole("link", { name: "Providers" })).not.toHaveAttribute(
			"aria-current",
			"page",
		);

		await page.getByRole("link", { name: "Providers" }).click();
		await expect(page).toHaveURL(/\/settings\/providers$/u);
		await expect(page.getByRole("link", { name: "Providers" }).first()).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("a picked project stays in the URL across the resource sections", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`/settings/skills?project=${query(PROJECT)}`);
		await expect(page.getByRole("combobox", { name: "Project" })).toContainText("project");

		await page.getByRole("link", { name: "MCP servers" }).first().click();
		await expect(page).toHaveURL(
			(url) => url.pathname === "/settings/mcp" && url.searchParams.get("project") === PROJECT,
		);
		await page.getByRole("link", { name: "Packages" }).first().click();
		await expect(page).toHaveURL(
			(url) => url.pathname === "/settings/packages" && url.searchParams.get("project") === PROJECT,
		);
		// Back to Global drops the folder, so the tab and the list agree.
		await page.getByRole("tab", { name: "Global" }).click();
		await expect(page).not.toHaveURL(/project=/u);
	});

	test("the app menu opens every section, and a phone uses it", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.getByRole("button", { name: "Toggle sidebar" }).click();
		await expect(page.getByRole("button", { name: "App menu" })).toBeVisible();
		await page.getByRole("button", { name: "App menu" }).click();
		await page.getByRole("menuitem", { name: "Providers" }).click();
		await expect(page).toHaveURL(/\/settings\/providers$/u);
		await expect(page.getByRole("link", { name: "MCP servers" })).toBeVisible();
	});

	test("the settings shell keeps a route's section list on a phone", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/settings/providers");
		await expect(page.getByRole("link", { name: "Back to app" })).toBeVisible();
		await page.getByRole("link", { name: "Providers" }).click();
		await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Search providers" })).toBeVisible();
	});
});
