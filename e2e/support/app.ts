import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** A path as the app puts it in a search param. */
export const query = (value: string): string => encodeURIComponent(value);

/**
 * Open a project through its URL, answering the trust gate the first time. The
 * trust write goes through the app, not the fixture, so the flow is exercised.
 */
export async function trustProject(page: Page, path: string): Promise<void> {
	const response = await page.request.post("/api/projects/trust", { data: { path } });
	expect(response.ok()).toBeTruthy();
}
