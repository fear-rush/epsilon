import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixture.ts";

/** The one session file a scratch home holds after a single chat. */
function sessionFileIn(agentHome: string): string {
	const root = join(agentHome, "sessions");
	const only = readdirSync(root, { recursive: true, encoding: "utf8" }).find((file) =>
		file.endsWith(".jsonl"),
	);
	if (only === undefined) throw new Error("no session file was written");
	return join(root, only);
}

/**
 * Flow 7: a change made outside Epsilon (a terminal pi) makes the chat read-only with a
 * notice, and Reload makes it writable again. Landing: step 5 (watcher, G1).
 */
test("a foreign append makes the chat read-only until it is reloaded", async ({
	agentHome,
	app,
	page,
}) => {
	await page.goto(app.url);
	await page.getByRole("button", { name: /new chat/i }).click();
	await page.getByRole("textbox", { name: /message/i }).fill("mine");
	await page.getByRole("textbox", { name: /message/i }).press("Enter");
	await expect(page.getByText("stub reply")).toBeVisible();

	appendFileSync(
		sessionFileIn(agentHome),
		`${JSON.stringify({
			type: "message",
			id: "foreign-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:09.000Z",
			message: { role: "user", content: [{ type: "text", text: "from a terminal" }] },
		})}\n`,
	);

	await expect(page.getByRole("status")).toContainText(/changed outside Epsilon/i);
	await page.getByRole("button", { name: /reload/i }).click();
	await expect(page.getByRole("textbox", { name: /message/i })).toBeEditable();
});
