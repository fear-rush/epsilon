import { expect, test as base } from "@playwright/test";

/**
 * A test that also fails when the page logs a console error. Browser resource
 * failures and React warnings are errors here: a page that only works in a noisy
 * console is not working. A test that deliberately requests a failure opts out
 * with `test.use({ consoleErrors: "ignore" })`.
 */
export const test = base.extend<{ consoleErrors: "fail" | "ignore" }>({
	consoleErrors: ["fail", { option: true }],
	page: async ({ page, consoleErrors }, use) => {
		const errors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		await use(page);
		if (consoleErrors === "fail") expect(errors, "console errors").toEqual([]);
	},
});

export { expect };
