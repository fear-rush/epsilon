import { EXPECTED_FAILURE, expect, test } from "./support/test";

import { query, trustProject } from "./support/app";
import { PINNED_ID, PROJECT_GATE, PROJECT_GATE_CHAT_ID } from "./support/home";

/**
 * The addresses the app serves, the URL state each page keeps, and the ones it
 * refuses. Each test starts from the seeded home, so the sidebar and the
 * project list are known.
 */
test.describe("routing and URL state", () => {
	test("home renders the chat landing and the seeded chats", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("New chat · Epsilon");
		await expect(page.getByRole("heading", { name: "Ask epsilon anything." })).toBeVisible();
		await expect(page.getByRole("link", { name: /Pinned chat/u })).toBeVisible();
		await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Open project" })).toBeVisible();
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

	test("a section's list page shows the placeholder until an entry is open", async ({ page }) => {
		await page.goto("/settings/providers");
		await expect(page.getByText("Select a provider")).toBeVisible();
		await page.goto("/settings/mcp");
		await expect(page.getByText("Select an MCP server")).toBeVisible();
		await page.goto("/settings/packages");
		await expect(page.getByText("Select a package")).toBeVisible();
	});

	test("/settings redirects to General and Back leaves Settings", async ({ page }) => {
		await page.goto("/");
		await page.goto("/settings");
		await expect(page).toHaveURL(/\/settings\/general$/u);
		await expect(page).toHaveTitle("General · Settings");

		await page.goBack();
		await expect(page).toHaveURL("/");
		await expect(page).toHaveTitle("New chat · Epsilon");

		await page.goForward();
		await expect(page).toHaveURL(/\/settings\/general$/u);
	});

	test("a malformed project search falls back to Global", async ({ page }) => {
		await page.goto("/settings/general?project=42");
		await expect(page).toHaveURL(/\/settings\/general$/u);
		await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
	});

	test("a malformed skill root and tab fall back to the home form", async ({ page }) => {
		await page.goto("/settings/skills?root=nope");
		await expect(page).toHaveURL(/\/settings\/skills$/u);
		await expect(page.getByRole("tab", { name: "Global" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /e2e-skill/u })).toBeVisible();

		await page.goto("/settings/skills/e2e-skill?root=home&tab=nope&file=references%2Fexample.md");
		await expect(page.getByRole("tab", { name: "Form" })).toHaveAttribute("aria-selected", "true");
	});

	test(
		"a skill path the inventory does not list says which path is gone",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto("/settings/skills/ghost?path=%2Fno%2Fsuch%2FSKILL.md");
			await expect(page.getByText("Skill not found")).toBeVisible();
			await expect(page.getByText(/No skill is loaded from/u)).toBeVisible();
		},
	);

	test("a scope segment that is not project reads the global file", async ({ page }) => {
		await page.goto("/settings/mcp/nope/e2e-headers");
		await expect(page.getByRole("heading", { name: "e2e-headers", exact: true })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "URL" })).toHaveValue("https://example.com/mcp");
	});

	test("a package scope that is not project reads the home's declarations", async ({ page }) => {
		await page.goto("/settings/packages/team/e2e-package");
		await expect(page.getByText("Not found")).toBeVisible();
		// The home declares the package by its absolute path, not a bare name.
		await expect(page).toHaveTitle(/e2e-package · Packages · Settings/u);
	});

	test("the add-provider address is the form, not a provider named new", async ({ page }) => {
		await page.goto("/settings/providers/new");
		await expect(page).toHaveTitle("New provider · Settings");
		await expect(page.getByRole("heading", { name: "New provider" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("");
	});

	test("a session without a project search opens as a chat, even with an empty one", async ({
		page,
	}) => {
		await trustProject(page, PROJECT_GATE);
		await page.goto(`/sessions/${PINNED_ID}?project=`);
		await expect(page.getByText("Hello from Pinned chat")).toBeVisible();
		await expect(page.getByText(/Trust /u)).toHaveCount(0);
	});

	test("a project session keeps its folder in the URL, and a chat does not add one", async ({
		page,
	}) => {
		await trustProject(page, PROJECT_GATE);
		await page.goto(`/sessions/${PROJECT_GATE_CHAT_ID}?project=${query(PROJECT_GATE)}`);
		await expect(page.getByText("This one runs behind the gate.")).toBeVisible();
		await expect(page).toHaveURL((url) => url.searchParams.get("project") === PROJECT_GATE);

		await page.getByRole("link", { name: /Pinned chat/u }).click();
		await expect(page).toHaveURL(new RegExp(`/sessions/${PINNED_ID}$`, "u"));
		await expect(page).not.toHaveURL(/project=/u);
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

		await page.getByRole("button", { name: "Toggle sidebar" }).click();
		await expect(page.getByRole("link", { name: /Pinned chat/u })).toBeVisible();
		await page.getByRole("link", { name: /Pinned chat/u }).click();
		await expect(page).toHaveURL(new RegExp(`/sessions/${PINNED_ID}$`, "u"));

		await page.goto("/settings/general");
		await expect(page.getByRole("link", { name: "MCP servers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Packages" })).toBeVisible();
	});

	test("a detail page on a phone has its back link to the list", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/settings/providers/e2e-dead`);
		await expect(page.getByRole("link", { name: "Providers" }).first()).toBeVisible();
		await expect(page.getByRole("heading", { name: "Dead Provider" })).toBeVisible();
	});
});
