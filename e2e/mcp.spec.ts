import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./support/test";
import { AGENT_HOME } from "./support/home";

const mcpFile = join(AGENT_HOME, "mcp.json");

const readMcp = async (): Promise<string> => readFile(mcpFile, "utf8").catch(() => "");

/** An enabled server omits the key; turning it off writes `enabled: false`. */
const enabledOf = async (name: string): Promise<boolean | undefined> => {
	// SAFETY: the MCP panel wrote this file, so its servers are objects with an optional flag.
	const parsed = JSON.parse(await readMcp()) as {
		mcpServers?: Record<string, { enabled?: boolean }>;
	};
	return parsed.mcpServers?.[name]?.enabled;
};

/** Adding, switching and removing one MCP server, all through the panel. */
test.describe("MCP editor", () => {
	test.use({ consoleErrors: "ignore" });

	test("add a command server and delete it", async ({ page }) => {
		await page.goto("/settings/mcp");
		await page.getByRole("button", { name: "Add MCP server" }).click();
		await expect(page.getByRole("dialog", { name: "Add MCP server" })).toBeVisible();

		await page.getByRole("tab", { name: "Command" }).click();
		await page.getByRole("textbox", { name: "Name" }).fill("e2e-add");
		await page.getByRole("textbox", { name: "Command" }).fill("cat");
		await page.getByRole("button", { name: "Next" }).click();
		await page.getByRole("button", { name: "Add server" }).click();

		await expect(page).toHaveURL(/\/settings\/mcp\/global\/e2e-add$/);
		await expect(page.getByRole("link", { name: /e2e-add/ })).toBeVisible();
		await expect.poll(readMcp).toContain("e2e-add");

		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await expect(page.getByRole("alertdialog", { name: "Remove e2e-add?" })).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();

		await expect(page).toHaveURL(/\/settings\/mcp$/);
		await expect(page.getByRole("link", { name: /e2e-add/ })).toHaveCount(0);
		await expect.poll(readMcp).not.toContain("e2e-add");
	});

	test("the enable switch writes mcp.json and can turn back off", async ({ page }) => {
		await page.goto("/settings/mcp/global/e2e-disabled");
		const toggle = page.getByRole("switch", { name: /e2e-disabled/ });
		await expect(toggle).not.toBeChecked();

		await toggle.click();
		await expect(toggle).toBeChecked();
		await expect.poll(() => enabledOf("e2e-disabled")).toBeUndefined();

		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await expect.poll(() => enabledOf("e2e-disabled")).toBe(false);
	});

	test("the raw tab shows the entry as JSON", async ({ page }) => {
		await page.goto("/settings/mcp/global/e2e-disabled");
		await page.getByRole("tab", { name: "Raw" }).click();
		await expect(page.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true");
		await expect(page.getByText("http://127.0.0.1:9/mcp").first()).toBeVisible();
	});
});
