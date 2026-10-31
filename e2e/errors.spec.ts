import { expect, test } from "./support/test";

import { composer, send } from "./support/app";
import { PROJECT_GATE, PROJECT_GATE_CHAT_ID } from "./support/home";
import { query } from "./support/app";

/**
 * The failures the shell must name: a refused read on every pane, a refused
 * write that keeps the draft, a folder list that cannot load, and a build older
 * than the server. Each test asks the browser to log a failed resource, so the
 * console guard is off for the whole block.
 */
test.describe("failure surfaces", () => {
	test.use({ consoleErrors: "ignore" });

	test("a refused session list is shown in the sidebar", async ({ page }) => {
		await page.route("**/api/sessions", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture session list is broken." }),
			}),
		);
		await page.goto("/");
		await expect(page.getByText("The fixture session list is broken.")).toBeVisible();
	});

	test("a refused settings read is shown in the General pane", async ({ page }) => {
		await page.route("**/api/settings*", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture settings are broken." }),
			}),
		);
		await page.goto("/settings/general");
		await expect(page.getByText("The fixture settings are broken.")).toBeVisible();
	});

	test("a refused settings read names the error in the Skills list", async ({ page }) => {
		await page.route("**/api/settings*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture skill inventory is broken." }),
			}),
		);
		await page.goto("/settings/skills");
		await expect(page.getByText("The fixture skill inventory is broken.")).toBeVisible();
	});

	test("a refused settings read names the error in the MCP list", async ({ page }) => {
		await page.route("**/api/settings*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture MCP snapshot is broken." }),
			}),
		);
		await page.goto("/settings/mcp");
		await expect(page.getByText("The fixture MCP snapshot is broken.")).toBeVisible();
	});

	test("a stale contract shows the reload banner", async ({ page }) => {
		await page.route("**/api/settings*", (route) =>
			route.fulfill({
				status: 200,
				headers: { "x-epsilon-contract": "an-older-build" },
				contentType: "application/json",
				body: JSON.stringify({}),
			}),
		);
		await page.goto("/settings/general");
		await expect(page.getByText("Epsilon was updated. Reload to continue.")).toBeVisible();
	});

	test("a readiness check that cannot reach the server shows reconnecting", async ({ page }) => {
		await page.route("**/api/readiness", (route) => route.abort());
		await page.goto("/");
		await expect(page.getByText("Reconnecting to the server…")).toBeVisible({
			timeout: 20_000,
		});
	});

	test("a refused provider write is named and the draft stays", async ({ page }) => {
		await page.route("**/api/settings/providers", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture refused this provider." }),
			}),
		);
		await page.goto("/settings/providers/new");
		await page.getByRole("textbox", { name: "Display name" }).fill("Refused Provider");
		await page.getByRole("combobox", { name: "API" }).click();
		await page.getByRole("option", { name: /OpenAI Chat Completions/u }).click();
		await page.getByRole("textbox", { name: "Base URL" }).fill("https://example.com/v1");
		await page.getByRole("button", { name: "Save", exact: true }).click();

		await expect(page.getByText("The fixture refused this provider.")).toBeVisible();
		await expect(page).toHaveURL(/\/settings\/providers\/new$/u);
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
			"Refused Provider",
		);
	});

	test("a refused default-model write is named next to the picker", async ({ page }) => {
		await page.route("**/api/settings/default-model", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture refused the default model." }),
			}),
		);
		await page.goto("/settings/general");
		await page.getByRole("button", { name: "Default model" }).click();
		await page.getByRole("option", { name: /Dead Model/u }).click();
		await expect(page.getByText("The fixture refused the default model.")).toBeVisible();
	});

	test("a folder list that fails is shown inside the picker", async ({ page }) => {
		await page.route("**/api/projects/folders*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture folder list is broken." }),
			}),
		);
		await page.goto("/");
		await page.getByRole("button", { name: "Open project" }).click();
		await expect(page.getByText("The fixture folder list is broken.")).toBeVisible();
	});

	test("a project status that fails is shown instead of the trust gate", async ({ page }) => {
		await page.route("**/api/projects/status*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture project status is broken." }),
			}),
		);
		await page.goto(`/sessions/${PROJECT_GATE_CHAT_ID}?project=${query(PROJECT_GATE)}`);
		await expect(page.getByText("The fixture project status is broken.")).toBeVisible();
		await expect(page.getByText("Trust project-gate?")).toHaveCount(0);
	});

	test("a refused rename keeps the dialog open and names the reason", async ({ page }) => {
		await page.route("**/api/sessions/*/name", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture refused this rename." }),
			}),
		);
		await page.goto("/");
		const row = page.getByRole("listitem").filter({ hasText: "Pinned chat" });
		await row.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Rename chat" }).click();
		await page.getByRole("textbox", { name: "Name" }).fill("Refused rename");
		await page.getByRole("button", { name: "Rename" }).click();

		await expect(page.getByRole("dialog", { name: "Rename chat" })).toBeVisible();
		await expect(page.getByText("The fixture refused this rename.")).toBeVisible();
	});

	test("a refused skill save keeps the form and names the reason", async ({ page }) => {
		await page.route(`**/api/settings/skills/home/e2e-skill`, (route) => {
			if (route.request().method() !== "PUT") return route.continue();
			return route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture refused this skill write." }),
			});
		});
		await page.goto("/settings/skills/e2e-skill?root=home");
		await page
			.getByRole("textbox", { name: "Description" })
			.fill("A description that will not save.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("The fixture refused this skill write.")).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
			"A description that will not save.",
		);
		await expect(page.getByText("Unsaved changes")).toBeVisible();
	});

	test("a refused MCP save keeps the form and names the reason", async ({ page }) => {
		await page.route("**/api/settings/mcp", (route) => {
			if (route.request().method() !== "POST") return route.continue();
			return route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture refused this MCP write." }),
			});
		});
		await page.goto("/settings/mcp/global/e2e-headers");
		await page
			.getByRole("textbox", { name: "Description" })
			.fill("A description that will not save.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("The fixture refused this MCP write.")).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
			"A description that will not save.",
		);
	});

	test("a composer still works after a refused settings read", async ({ page }) => {
		await page.route("**/api/settings*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "Settings are down for this test." }),
			}),
		);
		await page.goto("/");
		await expect(composer(page)).toBeVisible();
		await send(page, "!printf still-works");
		await expect(page.getByRole("button", { name: "bash printf still-works done" })).toBeVisible();
	});
});
