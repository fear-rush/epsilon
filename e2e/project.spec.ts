import { existsSync } from "node:fs";
import { join } from "node:path";

import { EXPECTED_FAILURE, expect, test } from "./support/test";

import {
	composer,
	findSessionFile,
	query,
	readText,
	send,
	sessionEntries,
	trustProject,
	waitIdle,
} from "./support/app";
import {
	AGENT_HOME,
	CHAT_ID,
	PROJECT,
	PROJECT_GATE,
	PROJECT_GATE_CHAT_ID,
	PROJECT_THREE,
	PROJECT_TWO,
	PROJECT_TWO_CHAT_ID,
	USER_HOME,
} from "./support/home";

/** pi's trust store: one path to one decision, and no file until the first one. */
// SAFETY: trust.json is the flat path-to-boolean map pi's own store writes.
const trustFile = async (): Promise<Record<string, boolean>> =>
	JSON.parse((await readText(join(AGENT_HOME, "trust.json"))) || "{}") as Record<string, boolean>;

/** The project row in the sidebar, whose name includes "Not trusted" until it is trusted. */
const projectRow = (page: import("@playwright/test").Page, name: string) =>
	page.getByRole("button", { name: new RegExp(`^${name}( Not trusted)?$`, "u") }).first();

const folderDialog = (page: import("@playwright/test").Page) =>
	page.getByRole("dialog", { name: "Open a project" });

/**
 * Make pi write a session file without calling a real model: switch to the
 * provider whose endpoint is a closed port, send one message, and let the
 * refused turn persist the user and assistant-error messages.
 */
async function failTurn(page: import("@playwright/test").Page, text: string): Promise<void> {
	await page
		.getByRole("button", { name: /DeepSeek V4.1 Flash|Dead Model/u })
		.first()
		.click();
	await page.getByRole("option", { name: "Dead Model" }).click();
	await send(page, text);
	await expect(page.getByText(/e2e-dead\/dead-model:/u)).toBeVisible({ timeout: 90_000 });
	await waitIdle(page);
}

test.describe.serial("projects", () => {
	test("the trust gate refuses the project until Trust folder is answered", async ({ page }) => {
		await page.goto("/");
		const row = projectRow(page, "project-gate");
		await expect(row.locator('[aria-label="Not trusted"]')).toBeVisible();
		await page.getByRole("button", { name: "project-gate actions" }).click();
		const settings = page.getByRole("menuitem", {
			name: "Project settings (trust it first)",
		});
		await expect(settings).toBeDisabled();
		await page.keyboard.press("Escape");

		await page.goto(`/sessions/${PROJECT_GATE_CHAT_ID}?project=${query(PROJECT_GATE)}`);
		await expect(page.getByText("Trust project-gate?")).toBeVisible();
		await expect(page.getByText(PROJECT_GATE, { exact: true })).toBeVisible();
		await expect(page.getByText(/can read files here/u)).toBeVisible();
		await expect(page.getByText(/also load: settings, extensions, skills/u)).toBeVisible();

		// Cancel leaves the folder untrusted and the page goes home.
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page).toHaveURL("/");
		expect(await trustFile()).not.toHaveProperty(PROJECT_GATE);

		await page.goto(`/sessions/${PROJECT_GATE_CHAT_ID}?project=${query(PROJECT_GATE)}`);
		await page.getByRole("button", { name: "Trust folder" }).click();
		await expect(page.getByText("This one runs behind the gate.")).toBeVisible();
		await expect.poll(async () => (await trustFile())[PROJECT_GATE]).toBe(true);
	});

	test("a trusted project's row drops the warning and reaches its settings", async ({ page }) => {
		await trustProject(page, PROJECT_GATE);
		await page.goto("/");
		const row = projectRow(page, "project-gate");
		await expect(row).not.toContainText("Not trusted");
		await row.click();
		await expect(page.getByRole("link", { name: /Gate chat/u })).toBeVisible();

		await page.getByRole("button", { name: "project-gate actions" }).click();
		await page.getByRole("menuitem", { name: "Project settings" }).click();
		await expect(page).toHaveURL(
			(url) => url.pathname === "/settings/mcp" && url.searchParams.get("project") === PROJECT_GATE,
		);
	});

	test(
		"the folder picker browses, shows hidden folders, and refuses a relative path",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto("/");
			await page.getByRole("button", { name: "Open project" }).click();
			const dialog = folderDialog(page);
			await expect(dialog).toBeVisible();
			await expect(dialog.getByText(USER_HOME, { exact: true })).toBeVisible();
			await expect(dialog.getByRole("button", { name: /^project\b/u }).first()).toBeVisible();

			// A dot folder is hidden until the checkbox asks for it.
			await expect(dialog.getByRole("button", { name: /^\.agents/u })).toHaveCount(0);
			await dialog.getByRole("checkbox", { name: "Show hidden" }).click();
			await expect(dialog.getByRole("button", { name: /^\.agents/u })).toBeVisible();
			await expect(dialog.getByRole("button", { name: /^\.claude/u })).toBeVisible();

			// Up one folder stops at the sandbox's ~, which is the picker's root.
			await expect(dialog.getByRole("button", { name: "Up one folder" })).toBeDisabled();

			const path = dialog.getByLabel("Or type a path");
			await path.fill("project");
			await dialog.getByRole("button", { name: "Go" }).click();
			await expect(dialog.getByText(/"project" is not an absolute path/u)).toBeVisible();
			await path.fill("/no/such/folder");
			await dialog.getByRole("button", { name: "Go" }).click();
			await expect(dialog.getByText(/does not exist/u)).toBeVisible();

			await path.fill(PROJECT_THREE);
			await dialog.getByRole("button", { name: "Go" }).click();
			await expect(dialog.getByText(PROJECT_THREE, { exact: true })).toBeVisible();
			await dialog.getByRole("button", { name: "Open this folder" }).click();

			const trust = page.getByRole("dialog", { name: "Trust project-three?" });
			await expect(trust).toBeVisible();
			await expect(trust.getByText(PROJECT_THREE, { exact: true })).toBeVisible();
			await trust.getByRole("button", { name: "Trust and open" }).click();

			await expect(page).toHaveURL(
				(url) =>
					url.pathname.startsWith("/sessions/") &&
					url.searchParams.get("project") === PROJECT_THREE,
			);
			// The draft is live in the folder before anything is written; an extension's
			// session-start notice makes the box docked instead of the landing heading.
			await expect(composer(page)).toBeVisible();
			await expect(page.getByText("project-three", { exact: true }).first()).toBeVisible();
			await expect.poll(async () => (await trustFile())[PROJECT_THREE]).toBe(true);
		},
	);

	test("the picker creates a folder, then trusts and opens it", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Open project" }).click();
		const dialog = folderDialog(page);
		await dialog.getByRole("button", { name: "New folder" }).click();
		await dialog.getByLabel("New folder name").fill("created-folder");
		await dialog.getByRole("button", { name: "Create" }).click();
		await expect(
			dialog.getByText(join(USER_HOME, "created-folder"), { exact: true }),
		).toBeVisible();
		expect(existsSync(join(USER_HOME, "created-folder"))).toBe(true);

		await dialog.getByRole("button", { name: "Open this folder" }).click();
		const trust = page.getByRole("dialog", { name: "Trust created-folder?" });
		await expect(trust).toBeVisible();
		await trust.getByRole("button", { name: "Trust and open" }).click();
		await expect(page).toHaveURL(
			(url) => url.searchParams.get("project")?.endsWith("created-folder") === true,
		);
	});

	test("a new chat in a project runs there and joins the sidebar group", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto("/");
		await projectRow(page, "project").click();
		await page.getByRole("button", { name: "New chat in project", exact: true }).click();
		await expect(page).toHaveURL(
			(url) => url.pathname.startsWith("/sessions/") && url.searchParams.get("project") === PROJECT,
		);
		const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
		await expect(composer(page)).toBeVisible();

		await send(page, "!printf project-chat-marker");
		// A fresh session writes no file until a user or assistant message exists, so
		// the first turn is a refused provider call: it is fast, needs no credential,
		// and still proves which folder pi recorded for the chat.
		await failTurn(page, "Hello from the project.");
		await expect
			.poll(async () => (await sessionEntries(id))[0])
			.toMatchObject({ type: "session", cwd: PROJECT });
		await expect
			.poll(async () => {
				// SAFETY: the route's documented SessionList, read only for the project rows.
				const list = (await (await page.request.get("/api/sessions")).json()) as {
					projects: { project: { path: string }; sessions: { id: string }[] }[];
				};
				return list.projects
					.find((entry) => entry.project.path === PROJECT)
					?.sessions.some((entry) => entry.id === id);
			})
			.toBe(true);
		await expect(page.getByRole("link", { name: /Hello from the project/u })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("moving a chat to a project forks its history and removes the chat", async ({ page }) => {
		await trustProject(page, PROJECT);
		// A seeded chat has a file, so the move needs no turn at all.
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		const original = CHAT_ID;

		await page.getByRole("main").getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: /Move to project/u }).click();
		const dialog = page.getByRole("dialog", { name: "Move this chat to a project" });
		await expect(dialog).toBeVisible();
		await dialog.getByLabel("Or type a path").fill(PROJECT);
		await dialog.getByRole("button", { name: "Go" }).click();
		await dialog.getByRole("button", { name: "Move this folder" }).click();

		await expect(page).toHaveURL(
			(url) =>
				url.pathname.startsWith("/sessions/") &&
				url.pathname !== `/sessions/${original}` &&
				url.searchParams.get("project") === PROJECT,
		);
		const moved = new URL(page.url()).pathname.split("/").at(-1) ?? "";
		// The whole transcript forked, including the tool run and the refused turn.
		await expect(page.getByText("The fixture command printed")).toBeVisible();
		await expect(page.getByText(/The fixture provider refused this call/u)).toBeVisible();
		await expect
			.poll(async () => (await sessionEntries(moved))[0])
			.toMatchObject({ type: "session", cwd: PROJECT });
		await expect.poll(async () => findSessionFile(original)).toBeUndefined();
	});

	test("removing a project deletes its chats and keeps the folder and its trust", async ({
		page,
	}) => {
		await trustProject(page, PROJECT_TWO);
		await page.goto("/");
		await projectRow(page, "project-two").click();
		await page.getByRole("button", { name: "project-two actions" }).click();
		await page.getByRole("menuitem", { name: "Remove from Epsilon" }).click();
		const dialog = page.getByRole("alertdialog", { name: "Remove project-two from Epsilon?" });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("Its chat is deleted from pi's history.");
		await dialog.getByRole("button", { name: "Remove" }).click();

		await expect(projectRow(page, "project-two")).toHaveCount(0);
		await expect(page.getByRole("link", { name: /Second project chat/u })).toHaveCount(0);
		expect(existsSync(PROJECT_TWO)).toBe(true);
		expect(await findSessionFile(PROJECT_TWO_CHAT_ID)).toBeUndefined();
		expect((await trustFile())[PROJECT_TWO]).toBe(true);
	});

	test("a project session reopens from the sidebar, with its folder named", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto("/");
		await projectRow(page, "project").click();
		await page.getByRole("link", { name: /Project chat/u }).click();
		await expect(page.getByText("This one runs in the project.")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Project chat" })).toBeVisible();
		await expect(page.getByText("project", { exact: true }).first()).toBeVisible();
		await expect(composer(page)).toBeVisible();
	});

	test("a project session URL without trust names the folder in the gate", async ({ page }) => {
		// The gate is the page's own answer for a folder pi has not trusted; a chat
		// whose folder is trusted opens straight through.
		await page.goto(`/sessions/${PROJECT_GATE_CHAT_ID}?project=${query(PROJECT_GATE)}`);
		await expect(page.getByText("This one runs behind the gate.")).toBeVisible();
		await expect(page.getByText(/Trust project-gate/u)).toHaveCount(0);
	});
});
