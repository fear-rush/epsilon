import { expect, test } from "./support/test";

/**
 * The failures the shell must name: a refused read, a build that is older than
 * the server, and a readiness check that cannot reach it. Each test asks the
 * browser to log a failed resource, so the console guard is off here.
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

	test("a refused settings read is shown in the pane", async ({ page }) => {
		await page.route("**/api/settings**", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture settings are broken." }),
			}),
		);
		await page.goto("/settings/general");
		await expect(page.getByText("The fixture settings are broken.")).toBeVisible();
	});

	test("a stale contract shows the reload banner", async ({ page }) => {
		await page.route("**/api/settings**", (route) =>
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
});
