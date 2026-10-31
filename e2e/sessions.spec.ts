import { writeFile } from "node:fs/promises";

import { expect, test } from "./support/test";

import {
	composer,
	findSessionFile,
	readText,
	sessionEntries,
	startChat,
	waitIdle,
} from "./support/app";
import { LIVE, LIVE_REASON, PINS_FILE, RENAME_ID, PINNED_ID } from "./support/home";
import { EXPECTED_FAILURE } from "./support/test";

const RENAMED = "Renamed by the e2e suite";

// SAFETY: Epsilon's pins file is the shape this test writes and reads.
const pinsFile = async (): Promise<{ sessions: string[] }> =>
	JSON.parse((await readText(PINS_FILE)) || '{"sessions":[]}') as { sessions: string[] };

const chatRow = (page: import("@playwright/test").Page, name: string | RegExp) =>
	page.getByRole("listitem").filter({ hasText: name });

const renameTo = async (page: import("@playwright/test").Page, name: string): Promise<void> => {
	const dialog = page.getByRole("dialog", { name: "Rename chat" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("textbox", { name: "Name" }).fill(name);
	await dialog.getByRole("button", { name: "Rename" }).click();
	await expect(dialog).toHaveCount(0);
};

test.describe.serial("sessions", () => {
	test("the seeded pinned chat keeps its badge and its pin across a reload", async ({ page }) => {
		await page.goto("/");
		const pinned = chatRow(page, "Pinned chat");
		await expect(pinned.getByRole("img", { name: "Pinned" })).toBeVisible();
		expect((await pinsFile()).sessions).toContain(PINNED_ID);

		await page.reload();
		await expect(chatRow(page, "Pinned chat").getByRole("img", { name: "Pinned" })).toBeVisible();
	});

	test("renaming from the sidebar updates the open chat's title and the file", async ({ page }) => {
		await page.goto(`/sessions/${RENAME_ID}`);
		await expect(page.getByRole("heading", { name: "Rename me" })).toBeVisible();

		await chatRow(page, "Rename me").getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Rename chat" }).click();
		await expect(page.getByRole("dialog", { name: "Rename chat" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Rename me");

		// An empty name cannot be submitted, and the reason is not a silent no-op.
		await page.getByRole("textbox", { name: "Name" }).fill("   ");
		await expect(page.getByText("A chat needs a name.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Rename" })).toBeDisabled();

		await renameTo(page, RENAMED);
		await expect(page.getByRole("link", { name: new RegExp(RENAMED, "u") })).toBeVisible();
		await expect(page.getByRole("heading", { name: RENAMED })).toBeVisible();

		await expect
			.poll(async () => {
				const entries = await sessionEntries(RENAME_ID);
				return entries.filter((entry) => entry.type === "session_info").at(-1);
			})
			.toMatchObject({ name: RENAMED });
	});

	test("a rename survives a reload and a second rename reads the saved name", async ({ page }) => {
		await page.goto(`/sessions/${RENAME_ID}`);
		await expect(page.getByRole("heading", { name: RENAMED })).toBeVisible();

		await chatRow(page, RENAMED).getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Rename chat" }).click();
		await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(RENAMED);
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("dialog", { name: "Rename chat" })).toHaveCount(0);
	});

	test("pinning writes Epsilon's own file and unpinning removes the entry", async ({ page }) => {
		await page.goto("/");
		const row = chatRow(page, RENAMED);
		await row.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Pin chat" }).click();
		await expect(chatRow(page, RENAMED).getByRole("img", { name: "Pinned" })).toBeVisible();
		await expect.poll(async () => (await pinsFile()).sessions).toContain(RENAME_ID);

		// A reload reads the file, so the badge is not only this tab's state.
		await page.reload();
		const pinned = chatRow(page, RENAMED);
		await expect(pinned.getByRole("img", { name: "Pinned" })).toBeVisible();

		await pinned.getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Unpin chat" }).click();
		await expect(chatRow(page, RENAMED).getByRole("img", { name: "Pinned" })).toHaveCount(0);
		await expect.poll(async () => (await pinsFile()).sessions).not.toContain(RENAME_ID);
		// The seeded pin was left alone.
		expect((await pinsFile()).sessions).toContain(PINNED_ID);
	});

	test("deleting the open chat asks first, then leaves its page and the pins file clean", async ({
		page,
	}) => {
		await page.goto("/");
		await chatRow(page, RENAMED).getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Pin chat" }).click();
		await expect.poll(async () => (await pinsFile()).sessions).toContain(RENAME_ID);

		await page.getByRole("link", { name: new RegExp(RENAMED, "u") }).click();
		await expect(page).toHaveURL(new RegExp(`/sessions/${RENAME_ID}$`, "u"));
		await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

		await chatRow(page, RENAMED).getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Delete chat" }).click();
		const dialog = page.getByRole("alertdialog", { name: "Delete this chat?" });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(RENAMED);
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect(await findSessionFile(RENAME_ID)).not.toBeUndefined();

		await chatRow(page, RENAMED).getByRole("button", { name: "Chat actions" }).click();
		await page.getByRole("menuitem", { name: "Delete chat" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

		// The open chat is gone, so the page leaves instead of reattaching to nothing.
		await expect(page).toHaveURL("/");
		await expect(page.getByRole("link", { name: new RegExp(RENAMED, "u") })).toHaveCount(0);
		await expect.poll(async () => findSessionFile(RENAME_ID)).toBeUndefined();
		await expect.poll(async () => (await pinsFile()).sessions).not.toContain(RENAME_ID);
	});

	test(
		"a broken pins file is reported instead of dropping pins in silence",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await writeFile(PINS_FILE, "{ not json", "utf8");
			await page.goto("/");
			await expect(page.getByText(/Pinned chats could not be read/u)).toBeVisible();
			await expect(page.getByText(PINS_FILE)).toBeVisible();

			await writeFile(PINS_FILE, `${JSON.stringify({ sessions: [PINNED_ID] }, null, 2)}\n`, "utf8");
			await page.reload();
			await expect(page.getByText(/Pinned chats could not be read/u)).toHaveCount(0);
			await expect(chatRow(page, "Pinned chat").getByRole("img", { name: "Pinned" })).toBeVisible();
		},
	);

	test("a shell-only chat stays off the list until a message persists it", async ({ page }) => {
		await page.goto("/");
		const id = await startChat(page, "!printf first-message-row");
		await expect(
			page.getByRole("button", { name: "bash printf first-message-row done" }),
		).toBeVisible();
		expect(id).toMatch(/^[0-9a-f-]{36}$/u);
		// A shell run alone does not create the file: pi writes on a user or assistant
		// message, so the list (which reads files) cannot show it yet.
		// SAFETY: the route's documented SessionList, read only for the chat ids.
		const list = (await (await page.request.get("/api/sessions")).json()) as {
			chats: { id: string }[];
		};
		expect(list.chats.some((chat) => chat.id === id)).toBe(false);
		await expect(page.getByRole("link", { name: /first-message-row/u })).toHaveCount(0);
	});

	test(
		"deleting a running chat is refused and named in the dialog",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			test.skip(!LIVE, LIVE_REASON);
			await page.goto("/");
			await startChat(
				page,
				"Write a very detailed 2000-word history of databases. Do not stop early.",
			);
			await expect(page.getByRole("button", { name: "Stop the run" })).toBeVisible({
				timeout: 60_000,
			});
			// Leave the run alone: the engine keeps working, and the list's running badge
			// is what the delete has to respect.
			await page.goto("/");
			const row = page
				.getByRole("listitem")
				.filter({ hasText: /Write a very detailed 2000-word history of databases/u })
				.first();
			await expect(row).toBeVisible({ timeout: 30_000 });
			await row.getByRole("button", { name: "Chat actions" }).click();
			await page.getByRole("menuitem", { name: "Delete chat" }).click();
			const dialog = page.getByRole("alertdialog", { name: "Delete this chat?" });
			await dialog.getByRole("button", { name: "Delete" }).click();
			await expect(dialog.getByText(/A live agent still holds this session/u)).toBeVisible({
				timeout: 30_000,
			});
			await dialog.getByRole("button", { name: "Cancel" }).click();

			// The chat is still there, and opening it shows the live run rather than a corpse.
			await row.getByRole("link").click();
			await expect(page.getByRole("button", { name: "Stop the run" })).toBeVisible();
			await page.getByRole("button", { name: "Stop the run" }).click();
			await waitIdle(page);
			await expect(composer(page)).toBeVisible();
		},
	);

	test("the chat list reports what each row knows after a run", async ({ page }) => {
		await page.goto("/");
		// SAFETY: the route's documented SessionList; the fields read are its summary shape.
		const list = (await (await page.request.get("/api/sessions")).json()) as {
			chats: { id: string; pinned: boolean; messageCount: number; needsInput: boolean }[];
		};
		const pinned = list.chats.find((chat) => chat.id === PINNED_ID);
		expect(pinned?.pinned).toBe(true);
		expect(pinned?.needsInput).toBe(false);
		// Two seeded messages plus whatever an earlier spec appended to this chat.
		expect(pinned?.messageCount).toBeGreaterThanOrEqual(2);
	});
});
