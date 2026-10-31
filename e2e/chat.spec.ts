import { expect, test } from "./support/test";

import {
	composer,
	answerConfirm,
	messagesOf,
	send,
	sessionEntries,
	startChat,
	waitIdle,
} from "./support/app";
import { CHAT_ID, LIVE, LIVE_MODEL, LIVE_MODEL_TWO, LIVE_REASON, PINNED_ID } from "./support/home";

/** The assistant bubbles, so a marker in the echoed prompt cannot satisfy an assertion. */
const assistantBubbles = (page: import("@playwright/test").Page) =>
	page.locator('[data-slot="message"][data-align="start"]');

const userBubbles = (page: import("@playwright/test").Page) =>
	page.locator('[data-slot="message"][data-align="end"]');

/** A real turn is slow and the provider decides how long; give the assertion its own room. */
const REPLY_TIMEOUT = 100_000;

test.describe("conversation", () => {
	test("a seeded session renders every row kind", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page).toHaveTitle("Chat · Epsilon");

		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await expect(page.getByText("The fixture command printed")).toBeVisible();
		await expect(page.getByText("printf shell")).toBeVisible();
		await expect(page.getByText("const answer = 42;")).toBeVisible();
		// thinking, a refused turn, and both summaries are rows too, not silence.
		await expect(page.getByText("The fixture weighs its answer before writing it.")).toBeVisible();
		await expect(page.getByText("A considered fixture answer.")).toBeVisible();
		await expect(page.getByText(/The fixture provider refused this call/)).toBeVisible();
		await expect(page.getByText("compaction summary")).toBeVisible();
		await expect(page.getByText("branch summary")).toBeVisible();
	});

	test("a reload reattaches and keeps the transcript", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await page.reload();
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		await expect(page.getByText("const answer = 42;")).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/sessions/${CHAT_ID}$`, "u"));
	});

	test("the composer palette opens and Send follows the draft", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		const box = composer(page);
		await box.fill("/");
		await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
		await expect(page.getByRole("option", { name: /\/permission/ })).toBeVisible();
		await expect(page.getByRole("option", { name: /\/skill:e2e-skill/ })).toBeVisible();

		// Arrow keys move the highlight, Enter fills the draft instead of sending it.
		await box.press("ArrowDown");
		await box.press("Enter");
		await expect(box).toHaveValue(/^\/\S+ $/u);

		await box.press("Escape");
		await box.fill("a draft");
		await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

		await box.fill("");
		await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	test("a new chat sends a real turn and writes pi's session file", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		const marker = "EPSILON-REAL-TURN";
		const id = await startChat(page, `Reply with exactly this word and nothing else: ${marker}`);

		await expect(assistantBubbles(page).last()).toContainText(marker, {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);
		// The sidebar shows the new chat, named by pi's own session entry or first message.
		await expect(page.getByRole("link", { name: new RegExp(marker, "u") })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`, "u"));

		await expect
			.poll(async () => (await sessionEntries(id)).length, { timeout: 20_000 })
			.toBeGreaterThan(2);
		const entries = await sessionEntries(id);
		const assistant = messagesOf(entries).findLast((message) => message.role === "assistant");
		expect(assistant?.stopReason).toBe("stop");
		expect(assistant?.model).toBe(LIVE_MODEL);
		expect(
			assistant?.content?.some((part) => part.type === "text" && part.text?.includes(marker)),
		).toBe(true);
	});

	test("the model menu switches the model the next turn uses", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(page, "Reply with exactly: FIRST-MODEL");
		await expect(assistantBubbles(page).last()).toContainText("FIRST-MODEL", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		await page.getByRole("button", { name: /DeepSeek V4.1 Flash/u }).click();
		await page.getByRole("option", { name: "Qwen 3.7 Flash" }).click();
		await expect(page.getByRole("button", { name: /Qwen 3.7 Flash/u })).toBeVisible();

		await send(page, "Reply with exactly: SECOND-MODEL");
		await expect(assistantBubbles(page).last()).toContainText("SECOND-MODEL", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		const entries = await sessionEntries(id);
		const assistant = messagesOf(entries).findLast((message) => message.role === "assistant");
		expect(assistant?.model).toBe(LIVE_MODEL_TWO);
	});

	test("the thinking menu records a level pi keeps", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(page, "Reply with exactly: THINKING-SETUP");
		await expect(assistantBubbles(page).last()).toContainText("THINKING-SETUP", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		await page.getByRole("button", { name: /^Thinking level: /u }).click();
		await page.getByRole("menuitemradio", { name: "High" }).click();
		await expect(page.getByRole("button", { name: "Thinking level: High" })).toBeVisible();

		await expect
			.poll(
				async () =>
					(await sessionEntries(id)).filter((entry) => entry.type === "thinking_level_change"),
				{ timeout: 20_000 },
			)
			.not.toHaveLength(0);
		const stored = (await sessionEntries(id)).filter(
			(entry) => entry.type === "thinking_level_change",
		);
		expect(stored.at(-1)).toMatchObject({ thinkingLevel: "high" });
	});

	test("a bash tool call asks first, runs, and shows its output", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(page, "Reply with exactly: TOOL-SETUP");
		await expect(assistantBubbles(page).last()).toContainText("TOOL-SETUP", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		// A chat starts read-only; the tool switch is what allows commands.
		await expect(page.getByRole("button", { name: /Read only/u })).toBeVisible();
		await page.getByRole("button", { name: /Read only/u }).click();
		await page.getByRole("menuitemradio", { name: /Commands & edits/u }).click();
		await expect(page.getByRole("button", { name: /Commands & edits/u })).toBeVisible();

		await send(
			page,
			"Use the bash tool to run exactly this command: printf epsilon-e2e-tool. Then reply with its output.",
		);
		await answerConfirm(page, true);
		await expect(page.getByText(/printf epsilon-e2e-tool/u).first()).toBeVisible({
			timeout: REPLY_TIMEOUT,
		});
		await expect(page.getByText("epsilon-e2e-tool", { exact: true }).first()).toBeVisible({
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		// The extension state is the composer's, and the turn is in pi's transcript.
		await expect(page.getByRole("button", { name: /Ask/u })).toBeVisible();
		const entries = await sessionEntries(id);
		expect(messagesOf(entries).some((message) => message.role === "toolResult")).toBe(true);
	});

	test("a yolo permission runs the next command without asking", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		await startChat(page, "Reply with exactly: PERMISSION-SETUP");
		await expect(assistantBubbles(page).last()).toContainText("PERMISSION-SETUP", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		await page.getByRole("button", { name: /Ask/u }).click();
		await page.getByRole("menuitemradio", { name: /Yolo/u }).click();
		await expect(page.getByRole("button", { name: /Yolo/u })).toBeVisible();

		await page.getByRole("button", { name: /Read only/u }).click();
		await page.getByRole("menuitemradio", { name: /Commands & edits/u }).click();
		await send(
			page,
			"Use the bash tool to run exactly: printf epsilon-yolo-ok. Then reply with its output.",
		);
		await expect(page.getByText("epsilon-yolo-ok", { exact: true }).first()).toBeVisible({
			timeout: REPLY_TIMEOUT,
		});
		await expect(page.getByRole("dialog", { name: /^Allow bash/u })).toHaveCount(0);
		await waitIdle(page);
	});

	test("! and !! run a shell command in the chat's folder", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await send(page, "!printf epsilon-bang");
		const bang = page.getByRole("button", { name: "bash printf epsilon-bang done" });
		await expect(bang).toBeVisible();
		await bang.click();
		await expect(page.getByText("epsilon-bang", { exact: true })).toBeVisible();

		await send(page, "!!printf epsilon-hidden");
		const hidden = page.getByRole("button", { name: "bash printf epsilon-hidden done" });
		await expect(hidden).toBeVisible();
		await hidden.click();
		await expect(page.getByText("epsilon-hidden", { exact: true })).toBeVisible();

		await expect
			.poll(
				async () => {
					const entries = await sessionEntries(CHAT_ID);
					return messagesOf(entries).filter((message) => message.role === "bashExecution");
				},
				{ timeout: 20_000 },
			)
			.toHaveLength(3);
	});

	test("Stop ends a long run and the chat still answers afterwards", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		await startChat(
			page,
			"Write a very long and detailed 2000-word history of computing. Do not stop early.",
		);
		const stop = page.getByRole("button", { name: "Stop the run" });
		await expect(stop).toBeVisible({ timeout: 60_000 });
		await stop.click();
		await waitIdle(page);

		await send(page, "Reply with exactly: AFTER-STOP");
		await expect(assistantBubbles(page).last()).toContainText("AFTER-STOP", {
			timeout: REPLY_TIMEOUT,
		});
	});

	test("a steer message joins the running turn", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(
			page,
			"Write a 600-word essay about the history of the pencil, in six paragraphs.",
		);
		await expect(page.getByRole("button", { name: "Stop the run" })).toBeVisible({
			timeout: 60_000,
		});
		// The composer is in steer mode, so Enter interrupts instead of queueing a new turn.
		await expect(composer(page)).toHaveAttribute("placeholder", /Steer this run/u);
		await send(page, "STEER-MARK-9911");
		await expect(composer(page)).toHaveValue("");

		// pi delivers the steer as the next user turn; it reaches the file either way.
		await expect
			.poll(
				async () =>
					messagesOf(await sessionEntries(id)).filter(
						(message) =>
							message.role === "user" &&
							message.content?.some((part) => part.text?.includes("STEER-MARK-9911")) === true,
					),
				{ timeout: 100_000 },
			)
			.toHaveLength(1);

		// A real model may stop to ask what the steer means. Answering with Cancel is
		// a legitimate end to that question, and the run must settle afterwards.
		const question = page.getByRole("dialog");
		if ((await question.count()) > 0) {
			const cancel = question.getByRole("button", { name: "Cancel", exact: true });
			if ((await cancel.count()) > 0) await cancel.click();
		}
		const stop = page.getByRole("button", { name: "Stop the run" });
		if ((await stop.count()) > 0) await stop.click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 60_000 });
	});

	test("a refused provider call is named, and another model recovers", async ({ page }) => {
		await page.goto("/");
		await startChat(page, "Reply with exactly: DEAD-SETUP");
		await page.getByRole("button", { name: /DeepSeek V4.1 Flash/u }).click();
		await page.getByRole("option", { name: "Dead Model" }).click();
		await expect(page.getByRole("button", { name: /Dead Model/u })).toBeVisible();

		await send(page, "Say something through the dead provider.");
		await expect(page.getByText(/e2e-dead\/dead-model:/u)).toBeVisible({ timeout: 90_000 });
		await waitIdle(page);

		await page.getByRole("button", { name: /Dead Model/u }).click();
		await page.getByRole("option", { name: "DeepSeek V4.1 Flash" }).click();
		await send(page, "Reply with exactly: RECOVERED-OK");
		await expect(assistantBubbles(page).last()).toContainText("RECOVERED-OK", {
			timeout: REPLY_TIMEOUT,
		});
	});

	test("/reload re-reads resources without a new turn", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
		const before = await userBubbles(page).count();
		await send(page, "/reload");
		await expect
			.poll(async () => (await sessionEntries(CHAT_ID)).length, { timeout: 20_000 })
			.toBeGreaterThan(0);
		await expect(userBubbles(page)).toHaveCount(before);
		await expect(page.getByText("Hello from the fixture")).toBeVisible();
	});

	test("/permission with an argument changes the mode without a turn", async ({ page }) => {
		await page.goto(`/sessions/${CHAT_ID}`);
		await expect(page.getByRole("button", { name: /Strict|Ask|Yolo/u })).toBeVisible();
		await send(page, "/permission strict");
		await expect(page.getByRole("button", { name: /Strict/u })).toBeVisible();
		await send(page, "/permission ask");
		await expect(page.getByRole("button", { name: /Ask/u })).toBeVisible();
	});

	test("denying the permission dialog blocks the call and says so", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(page, "Reply with exactly: DENY-SETUP");
		await expect(assistantBubbles(page).last()).toContainText("DENY-SETUP", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);
		await page.getByRole("button", { name: /Read only/u }).click();
		await page.getByRole("menuitemradio", { name: /Commands & edits/u }).click();

		await send(page, "Use the bash tool to run exactly: printf denied-command");
		await answerConfirm(page, false);
		await expect(page.getByRole("button", { name: /printf denied-command failed/u })).toBeVisible({
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);

		await expect
			.poll(async () =>
				messagesOf(await sessionEntries(id)).filter(
					(message) => message.role === "toolResult" && message.isError === true,
				),
			)
			.toHaveLength(1);
	});

	test("a permission dialog survives a reload and can still be answered", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(page, "Reply with exactly: REPLAY-SETUP");
		await expect(assistantBubbles(page).last()).toContainText("REPLAY-SETUP", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);
		await page.getByRole("button", { name: /Read only/u }).click();
		await page.getByRole("menuitemradio", { name: /Commands & edits/u }).click();
		await send(page, "Use the bash tool to run exactly: printf replayed-dialog");

		const dialog = page.getByRole("dialog", { name: /^Allow bash/u });
		await expect(dialog).toBeVisible({ timeout: REPLY_TIMEOUT });
		await page.reload();
		// The engine kept waiting, so the dialog is replayed to the new page.
		await expect(page.getByRole("dialog", { name: /^Allow bash/u })).toBeVisible({
			timeout: 30_000,
		});
		await answerConfirm(page, true);
		await expect(page.getByText("replayed-dialog", { exact: true }).first()).toBeVisible({
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);
		expect(id).toMatch(/^[0-9a-f-]{36}$/u);
	});

	test("a reload during a run reattaches to the live turn", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		const id = await startChat(
			page,
			"Write a very long and detailed 2000-word history of compilers. Do not stop early.",
		);
		await expect(page.getByRole("button", { name: "Stop the run" })).toBeVisible({
			timeout: 60_000,
		});
		await page.reload();
		// The snapshot carries isStreaming, so the new page shows the run as live.
		await expect(page.getByRole("button", { name: "Stop the run" })).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page
				.getByRole("region", { name: "Messages" })
				.getByText(/Write a very long and detailed 2000-word/u),
		).toBeVisible();
		await page.getByRole("button", { name: "Stop the run" }).click();
		await waitIdle(page);
		expect(id).toMatch(/^[0-9a-f-]{36}$/u);
	});

	test("two tabs watch one session and both see a shell run", async ({ page }) => {
		const second = await page.context().newPage();
		await second.goto(`/sessions/${PINNED_ID}`);
		await expect(second.getByText("Hello from Pinned chat")).toBeVisible();

		await page.goto(`/sessions/${PINNED_ID}`);
		await expect(page.getByText("Hello from Pinned chat")).toBeVisible();
		await send(page, "!printf fanout-marker");
		await expect(
			page.getByRole("button", { name: "bash printf fanout-marker done" }),
		).toBeVisible();
		// The second tab shares the live engine, so the frame reaches it without a reload.
		await expect(
			second.getByRole("button", { name: "bash printf fanout-marker done" }),
		).toBeVisible();
		await second.close();
	});

	test("a failing shell command is marked failed, not silently done", async ({ page }) => {
		await page.goto(`/sessions/${PINNED_ID}`);
		await send(page, "!false");
		await expect(page.getByRole("button", { name: /bash false failed/u })).toBeVisible();
	});

	test("the discuss tool asks a question the browser answers", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto("/");
		await startChat(
			page,
			"Use the discuss tool to ask me which color to use, with options Red and Blue. Do not choose yourself. After I answer, reply with exactly the color I picked.",
		);
		const dialog = page.getByRole("dialog", { name: /color/u });
		await expect(dialog).toBeVisible({ timeout: REPLY_TIMEOUT });
		await dialog.getByRole("button", { name: "Blue", exact: true }).click();
		await expect(assistantBubbles(page).last()).toContainText("Blue", {
			timeout: REPLY_TIMEOUT,
		});
		await waitIdle(page);
	});

	test("an unknown session id starts a new empty chat", async ({ page }) => {
		await page.goto("/sessions/99999999-9999-4999-8999-999999999999");
		// A fresh id with no file is a draft: the engine starts in the chats folder and
		// the box is ready, while pi writes nothing until the first message.
		await expect(composer(page)).toBeVisible();
		await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
		await send(page, "!printf draft-only");
		await expect(page.getByRole("button", { name: "bash printf draft-only done" })).toBeVisible();
	});
});
