import { expect, test } from "./support/test";

import { query, trustProject } from "./support/app";
import { CHAT_ID, DELETE_ID, PROJECT, PROJECT_CHAT_ID, PROJECT_CHAT_NAME } from "./support/home";

/** The seeded conversations: their rows, their chrome, and the sidebar actions. */
test.describe("conversation", () => {
	test("a seeded session renders every row kind", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page).toHaveTitle("Chat · Epsilon");

		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await expect(page.getByText("The fixture command printed")).toBeVisible();
		await expect(page.getByText("e2e", { exact: true }).first()).toBeVisible();
		await expect(page.getByText("printf shell")).toBeVisible();
		await expect(page.getByText("const answer = 42;")).toBeVisible();
	});

	test("a reload reattaches and keeps the transcript", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await page.reload();
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await expect(page.getByText("const answer = 42;")).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/sessions/${CHAT_ID}`));
	});

	test("the composer palette opens and Send follows the draft", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		const composer = page.getByRole("textbox", { name: /Message the agent/ });
		await composer.fill("/");
		await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
		await expect(page.getByRole("option", { name: /\/mcp/ })).toBeVisible();

		await composer.press("Escape");
		await composer.fill("a draft");
		await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

		await composer.fill("");
		await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	test("rename, pin and unpin a chat from the sidebar", async ({ page }) => {
		await page.goto("/");
		const row = page.getByRole("listitem").filter({ hasText: "Delete me" });
		await row.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Rename chat" }).click();
		await page.getByRole("textbox", { name: "Name" }).fill("Renamed chat");
		await page.getByRole("button", { name: "Rename" }).click();
		await expect(page.getByRole("link", { name: /Renamed chat/ })).toBeVisible();

		const renamed = page.getByRole("listitem").filter({ hasText: "Renamed chat" });
		await renamed.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Pin chat" }).click();
		await expect(page.getByRole("link", { name: /Pinned Renamed chat/ })).toBeVisible();

		await renamed.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Unpin chat" }).click();
		await expect(page.getByRole("link", { name: /Renamed chat/ })).toBeVisible();
	});

	test("delete a chat from the sidebar", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("link", { name: new RegExp(DELETE_ID) })).toHaveCount(0);
		const row = page.getByRole("listitem").filter({ hasText: "Renamed chat" });
		await row.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Delete chat" }).click();
		await expect(page.getByRole("alertdialog", { name: "Delete this chat?" })).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();
		await expect(page.getByRole("link", { name: /Renamed chat/ })).toHaveCount(0);
	});

	test("a project session opens under its folder", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`/sessions/${PROJECT_CHAT_ID}?project=${query(PROJECT)}`);

		await expect(page.getByRole("heading", { name: PROJECT_CHAT_NAME })).toBeVisible();
		await expect(page.getByText("This one runs in the project.")).toBeVisible();
		await expect(page.getByText("project", { exact: true }).first()).toBeVisible();
		await expect(page).toHaveURL((url) => url.searchParams.get("project") === PROJECT);
	});

	test("a trusted project joins the sidebar with its chat", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto("/");
		await page.getByRole("button", { name: "project", exact: true }).click();
		await expect(page.getByRole("link", { name: /Project chat/ })).toBeVisible();
		await page.getByRole("link", { name: /Project chat/ }).click();
		await expect(page).toHaveURL(/\/sessions\/33333333-3333-4333-8333-333333333333/);
	});
});
