import { expect, test } from "./support/test";

/**
 * The addresses the app serves, and the ones it refuses. Each test starts from
 * the seeded home, so the sidebar and the project list are known.
 */
test.describe("routing and URL state", () => {
	test("home renders the chat landing and the seeded chats", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("New chat · Epsilon");
		await expect(page.getByRole("heading", { name: "Ask epsilon anything." })).toBeVisible();
		await expect(page.getByRole("link", { name: /Seeded chat/ })).toBeVisible();
		await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	test("every settings section has its own title", async ({ page }) => {
		const sections = [
			["general", "General · Settings"],
			["providers", "Providers · Settings"],
			["mcp", "MCP servers · Settings"],
			["skills", "Skills · Settings"],
			["packages", "Packages · Settings"],
		] as const;
		for (const [path, title] of sections) {
			await page.goto(`/settings/${path}`);
			await expect(page).toHaveTitle(title);
		}
	});

	test("/settings redirects to General and Back leaves Settings", async ({ page }) => {
		await page.goto("/");
		await page.goto("/settings");
		await expect(page).toHaveURL(/\/settings\/general$/);
		await expect(page).toHaveTitle("General · Settings");

		await page.goBack();
		await expect(page).toHaveURL("/");
		await expect(page).toHaveTitle("New chat · Epsilon");
	});

	test("a malformed project search falls back to Global", async ({ page }) => {
		await page.goto("/settings/general?project=42");
		await expect(page).toHaveURL(/\/settings\/general$/);
		await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
	});

	test("a malformed skill root falls back to the home root", async ({ page }) => {
		await page.goto("/settings/skills?root=nope");
		await expect(page).toHaveURL(/\/settings\/skills$/);
		await expect(page.getByRole("tab", { name: "Global" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /e2e-skill/ })).toBeVisible();
	});

	test("an unknown address shows the product's not-found screen", async ({ page }) => {
		await page.goto("/nope");
		await expect(page).toHaveTitle("Epsilon");
		await expect(page.getByText("This page does not exist")).toBeVisible();
		await expect(page.getByRole("link", { name: "Back to the app" })).toBeVisible();
	});

	test("an unknown settings address keeps the settings shell", async ({ page }) => {
		await page.goto("/settings/nope");
		await expect(page.getByText("This page does not exist")).toBeVisible();
		await expect(page.getByRole("link", { name: "Providers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Back to the app" })).toBeVisible();
	});

	test("the phone layout hides the sidebar and keeps the settings nav", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await expect(page.getByRole("button", { name: "Toggle sidebar" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Ask epsilon anything." })).toBeVisible();

		await page.goto("/settings/general");
		await expect(page.getByRole("link", { name: "MCP servers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Packages" })).toBeVisible();
	});
});
