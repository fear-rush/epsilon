import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
	assistantEntry,
	callEntry,
	sessionHeader,
	toolResultEntry,
	userEntry,
	writeSession,
} from "../sessions.ts";
import { expect, test } from "./fixture.ts";

/**
 * One turn of the agent loop is one assistant message per tool call, so a stretch of work
 * arrives as many messages. The transcript folds them into one row: the run says what it
 * did, opens into its steps, and keeps a failure on the closed line.
 */
const runSession = (id: string, cwd: string): string => {
	const lines = [sessionHeader(id, cwd)];
	let parent: string | null = null;
	const add = (entry: { readonly id: string }): void => {
		lines.push(JSON.stringify(entry));
		parent = entry.id;
	};
	/** A step, then the result pi writes after it. */
	const step = (
		entryId: string,
		call: { readonly id: string; readonly name: string; readonly arguments?: unknown },
		options: {
			readonly thinking?: string;
			readonly output?: string;
			readonly isError?: boolean;
		},
		index: number,
	): void => {
		const callOptions: {
			calls: ReadonlyArray<{
				readonly id: string;
				readonly name: string;
				readonly arguments?: unknown;
			}>;
			thinking?: string;
			index: number;
		} = { calls: [call], index };
		if (options.thinking !== undefined) callOptions.thinking = options.thinking;
		add(callEntry(entryId, parent, callOptions));
		add(
			toolResultEntry(`${entryId}-result`, parent, options.output ?? "ok", {
				toolCallId: call.id,
				toolName: call.name,
				isError: options.isError ?? false,
				index: index + 1,
			}),
		);
	};

	add(userEntry("u1", parent, "start the run", 1));
	step(
		"a1",
		{
			id: "call-1",
			name: "bash",
			arguments: { command: "sed -n '1,40p' src/engine/translate.ts" },
		},
		{ thinking: "The window is missing noticesOf.", output: "const window = 1;" },
		2,
	);
	step(
		"a2",
		{ id: "call-2", name: "grep", arguments: { path: "src/engine" } },
		{ thinking: "Two call sites left.", output: "2 matches" },
		4,
	);
	step(
		"a3",
		{
			id: "call-3",
			name: "edit",
			arguments: {
				path: "src/engine/translate.ts",
				edits: [{ oldText: "stub", newText: "" }],
			},
		},
		{ thinking: "Drop the stub.", output: "edited" },
		6,
	);
	add(assistantEntry("a4", parent, "The stub is gone.", 8));

	add(userEntry("u2", parent, "run the tests", 9));
	step(
		"a5",
		{
			id: "call-4",
			name: "bash",
			arguments: { command: "bun run test engine/translate.test.ts" },
		},
		{
			thinking: "Run the tests.",
			output: "1 test failed: summary rows lose their label",
			isError: true,
		},
		10,
	);
	step(
		"a6",
		{
			id: "call-5",
			name: "bash",
			arguments: { command: "bun run test engine/translate.test.ts" },
		},
		{ thinking: "Label restored.", output: "2 tests passed" },
		12,
	);
	add(assistantEntry("a7", parent, "Both pass.", 14));

	add(userEntry("u3", parent, "one more", 15));
	step(
		"a8",
		{ id: "call-6", name: "bash", arguments: { command: "echo single" } },
		{ output: "single" },
		16,
	);
	add(assistantEntry("a9", parent, "Single step done.", 18));
	return `${lines.join("\n")}\n`;
};

test("a run of steps is one row that opens into them", async ({
	agentHome,
	app,
	page,
	projectsRoot,
}) => {
	const sessions = `${agentHome}/sessions/--tmp-project--`;
	const project = join(projectsRoot, "project");
	mkdirSync(project, { recursive: true });
	writeSession(sessions, "run", runSession("run", project));

	await page.goto(app.url);
	await page.getByRole("button", { name: "project", exact: true }).click();
	await page.getByRole("link", { name: /start the run/ }).click();
	await expect(page.getByRole("feed")).toBeVisible();

	// The stretch of work is one row, and the old per-message heading is gone.
	await expect(page.getByText("Ran 3 steps")).toBeVisible();
	await expect(page.getByText("1 command · 1 edit · 1 search")).toBeVisible();
	await expect(page.getByText(/Thought and ran/)).toHaveCount(0);

	// Closed once the answer is written: the steps are behind the line, not gone.
	const firstRun = page.getByRole("button", { name: /Ran 3 steps/ });
	await expect(firstRun).toHaveAttribute("aria-expanded", "false");
	await firstRun.click();
	await expect(firstRun).toHaveAttribute("aria-expanded", "true");
	await expect(page.getByText(/Ran sed -n/)).toBeVisible();
	await expect(page.getByText(/grep src\/engine/)).toBeVisible();
	await expect(page.getByText(/edit src\/engine\/translate\.ts/)).toBeVisible();
	await expect(page.getByText(/The window is missing noticesOf/).first()).toBeVisible();

	// A failed step is on the closed line and opens the run by itself.
	await expect(page.getByText("1 failed")).toBeVisible();
	await expect(page.getByRole("button", { name: /Ran 2 steps/ })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	await expect(page.getByText(/Failed to run bun run test/)).toBeVisible();

	// A run of one step is the step's own line: no heading over a single call.
	await expect(page.getByText(/Ran echo single/)).toBeVisible();
	await expect(page.getByText(/Ran 1 step/)).toHaveCount(0);
});
