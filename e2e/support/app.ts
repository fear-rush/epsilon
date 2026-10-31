/**
 * The helpers the specs share: a path in a search param, pi's own trust write,
 * file reads, session-file lookup, and the two flows that repeat on every page
 * (picking a Base UI option and driving the composer).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { AGENT_HOME } from "./home";

/** A path as the app puts it in a search param. */
export const query = (value: string): string => encodeURIComponent(value);

/**
 * Trust a folder through the app's route, which calls pi's `ProjectTrustStore`.
 * Used as setup for pages that need a trusted project before they render.
 */
export async function trustProject(page: Page, path: string): Promise<void> {
	const response = await page.request.post("/api/projects/trust", { data: { path } });
	expect(response.ok(), await response.text()).toBeTruthy();
}

export const readText = async (path: string): Promise<string> =>
	readFile(path, "utf8").catch(() => "");

export async function readJson<Value>(path: string): Promise<Value> {
	// SAFETY: every caller names a file pi or Epsilon wrote, and reads the shape it wrote there.
	return JSON.parse(await readText(path)) as Value;
}

/** A value read from a file the app writes, retried until the write lands. */
export async function fileContains(path: string, needle: string): Promise<void> {
	await expect.poll(async () => readText(path)).toContain(needle);
}

/**
 * The JSONL file pi wrote for a session, wherever its folder is. A new session's
 * folder is pi's encoded cwd, so the test must not guess it.
 */
export const findSessionFile = async (id: string): Promise<string | undefined> => {
	const root = join(AGENT_HOME, "sessions");
	const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
	for (const folder of folders) {
		if (!folder.isDirectory()) continue;
		const entries = await readdir(join(root, folder.name), { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (entry.isFile() && entry.name.includes(id) && entry.name.endsWith(".jsonl")) {
				return join(root, folder.name, entry.name);
			}
		}
	}
	return undefined;
};

/** One session file's entries, parsed. Empty until pi writes the file. */
export async function sessionEntries(id: string): Promise<FixtureEntry[]> {
	const path = await findSessionFile(id);
	if (path === undefined) return [];
	// SAFETY: pi writes one JSON object per line, and the fields read below are pi's own.
	return (await readText(path))
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as FixtureEntry);
}

type FixtureMessage = {
	role: string;
	content?: { type: string; text?: string; thinking?: string }[];
	stopReason?: string;
	errorMessage?: string;
	model?: string;
	provider?: string;
	isError?: boolean;
};

export type FixtureEntry =
	| { type: "session"; id: string; cwd: string }
	| { type: "session_info"; name: string }
	| { type: "message"; message: FixtureMessage }
	| { type: "thinking_level_change"; thinkingLevel: string }
	| { type: "model_change"; provider: string; modelId: string }
	| { type: string };

type MessageFixtureEntry = { type: "message"; message: FixtureMessage };

const isMessageEntry = (entry: FixtureEntry): entry is MessageFixtureEntry =>
	entry.type === "message";

export const messagesOf = (entries: FixtureEntry[]): FixtureMessage[] =>
	entries.flatMap((entry) => (isMessageEntry(entry) ? [entry.message] : []));

/** The composer's textarea, wherever the page puts it. */
export const composer = (page: Page): Locator =>
	page.getByRole("textbox", { name: /Message the agent|Steer the run/ });

/**
 * Send one prompt from the current conversation and wait until pi accepted it.
 * The reply is asserted by the caller, because a real provider decides its text.
 */
export async function send(page: Page, text: string): Promise<void> {
	const box = composer(page);
	await expect(box).toBeVisible();
	await box.fill(text);
	await box.press("Enter");
}

/**
 * The page is idle again. The submit button says "Send" only when no run is live,
 * so waiting for it spans the gap between a stopped turn and a queued one that
 * starts right after, which two separate assertions cannot.
 */
export async function waitIdle(page: Page): Promise<void> {
	await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Start a chat from the home page and return the id the URL took. */
export async function startChat(page: Page, first: string): Promise<string> {
	await page.goto("/");
	await send(page, first);
	await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
	const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
	expect(id).toMatch(/^[0-9a-f-]{36}$/u);
	return id;
}

/** Answer the blocking permission dialog pi's own extension raises. */
export async function answerConfirm(page: Page, allow: boolean): Promise<void> {
	const dialog = page.getByRole("dialog", { name: /^Allow /u });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: allow ? "Yes" : "No" }).click();
}
