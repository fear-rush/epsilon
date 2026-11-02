/**
 * The settings routes: one read with a row per key, and one write per key through
 * pi's own setter. These checks build real homes (and one trusted project) and use
 * the route the browser uses, then read pi's answer back.
 */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { createApp } from "../../app";
import { agentHome } from "../../platform/agent-home";
import { globalSettings } from "../../platform/pi";
import { settingWriteSchema } from "../general";
import { SessionRegistry } from "../conversation";

/** What the test writes to `settings.json`; any JSON object is a settings file. */
const settingsFileSchema = z.record(z.string(), z.json());
type SettingsFile = z.infer<typeof settingsFileSchema>;

const rowSchema = z.object({
	key: z.string(),
	value: z.unknown(),
	scope: z.string(),
	terminalOnly: z.boolean(),
	error: z.string().optional(),
});

const bodySchema = z.object({ agent: z.unknown(), settings: z.array(rowSchema) });
type Body = z.infer<typeof bodySchema>;

const appOn = async (settings?: SettingsFile) => {
	const home = agentHome(await mkdtemp(join(tmpdir(), "epsilon-settings-")));
	await mkdir(home.chatsDir, { recursive: true });
	if (settings !== undefined) {
		await writeFile(join(home.dir, "settings.json"), JSON.stringify(settings));
	}
	const app = createApp({ home, userHome: home.dir, engines: new SessionRegistry(home) });
	return { app, home };
};

const settingsOf = async (app: ReturnType<typeof createApp>, project?: string): Promise<Body> => {
	const query = project === undefined ? "" : `?project=${encodeURIComponent(project)}`;
	const response = await app.request(`/api/settings${query}`);
	expect(response.status).toBe(200);
	return bodySchema.parse(await response.json());
};

/** The one row for `key`; a read that omits a key under test fails here. */
const rowOf = (body: Body, key: string): z.infer<typeof rowSchema> => {
	const row = body.settings.find((setting) => setting.key === key);
	if (row === undefined) throw new Error(`${key} is not in the read`);
	return row;
};

test("a refused number is that key's error, not a failed page", async () => {
	const { app } = await appOn({ compaction: { reserveTokens: "lots" } });
	const body = await settingsOf(app);
	expect(body.agent).toBeNull();
	const row = rowOf(body, "compaction.reserveTokens");
	expect(row.value).toBeNull();
	expect(row.scope).toBe("global");
	expect(row.error).toContain("compaction.reserveTokens");
	// A key beside the refused one still answers with pi's own default.
	expect(rowOf(body, "compaction.keepRecentTokens").value).toBe(20000);
});

test("a key names the layer that supplies it, or pi's default", async () => {
	const { app } = await appOn({ steeringMode: "all", theme: "dark" });
	const body = await settingsOf(app);
	expect(rowOf(body, "steeringMode")).toMatchObject({ value: "all", scope: "global" });
	expect(rowOf(body, "followUpMode")).toMatchObject({
		value: "one-at-a-time",
		scope: "default",
	});
	// 16384 is pi's default reserve, so the row says default, not global.
	expect(rowOf(body, "compaction.reserveTokens")).toMatchObject({ value: 16384, scope: "default" });
	expect(rowOf(body, "compaction.reserveTokens").error).toBeUndefined();
	expect(rowOf(body, "theme")).toMatchObject({
		value: "dark",
		scope: "global",
		terminalOnly: true,
	});
	expect(rowOf(body, "steeringMode").terminalOnly).toBe(false);
});

test("a project's settings file is reported as the project layer", async () => {
	const base = await mkdtemp(join(tmpdir(), "epsilon-settings-project-"));
	const home = agentHome(join(base, "agent"));
	await mkdir(home.chatsDir, { recursive: true });
	await writeFile(join(home.dir, "settings.json"), JSON.stringify({ steeringMode: "all" }));
	const project = join(base, "project");
	await mkdir(join(project, ".pi"), { recursive: true });
	await writeFile(
		join(project, ".pi", "settings.json"),
		JSON.stringify({ steeringMode: "one-at-a-time" }),
	);
	const app = createApp({ home, userHome: home.dir, engines: new SessionRegistry(home) });
	const trusted = await app.request("/api/projects/trust", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ path: project }),
	});
	expect(trusted.status).toBe(200);
	const folder = z.object({ path: z.string() }).parse(await trusted.json()).path;

	const body = await settingsOf(app, folder);
	expect(rowOf(body, "steeringMode")).toMatchObject({
		value: "one-at-a-time",
		scope: "project",
	});
	expect(rowOf(body, "followUpMode")).toMatchObject({ scope: "default" });
});

/** A write through the route the browser uses. */
const write = (app: ReturnType<typeof createApp>, body: z.infer<typeof settingWriteSchema>) =>
	app.request("/api/settings", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

test("a written value lands in the file pi reads, and the read names its layer", async () => {
	const { app, home } = await appOn({});
	expect((await write(app, { key: "steeringMode", value: "all" })).status).toBe(204);
	// pi's own reader is the proof: a fresh manager sees the written value.
	expect(globalSettings(home).getSteeringMode()).toBe("all");
	expect(rowOf(await settingsOf(app), "steeringMode")).toMatchObject({
		value: "all",
		scope: "global",
	});
});

test("a nested key writes its own branch and keeps the others", async () => {
	const { app, home } = await appOn({ images: { autoResize: true }, theme: "dark" });
	expect((await write(app, { key: "images.blockImages", value: true })).status).toBe(204);
	const settings = globalSettings(home);
	expect(settings.getBlockImages()).toBe(true);
	expect(settings.getImageAutoResize()).toBe(true);
	expect(settings.getThemeSetting()).toBe("dark");
});

test("a per-model thinking override is added and removed", async () => {
	const { app, home } = await appOn({});
	const override = { provider: "anthropic", modelId: "claude-sonnet", level: "high" };
	expect((await write(app, { key: "modelThinkingLevels", value: override })).status).toBe(204);
	expect(globalSettings(home).getModelThinkingLevel("anthropic", "claude-sonnet")).toBe("high");
	expect(
		(await write(app, { key: "modelThinkingLevels", value: { ...override, level: null } })).status,
	).toBe(204);
	expect(globalSettings(home).getModelThinkingLevel("anthropic", "claude-sonnet")).toBeUndefined();
});

test("a key without a setter, or a value pi cannot take, is refused", async () => {
	const { app } = await appOn({});
	const unsettable = await write(app, { key: "compaction.reserveTokens", value: 1000 });
	expect(unsettable.status).toBe(400);
	expect(await unsettable.json()).toMatchObject({
		message: expect.stringContaining("compaction.reserveTokens"),
	});
	const wrongType = await write(app, { key: "steeringMode", value: 5 });
	expect(wrongType.status).toBe(400);
	expect(await wrongType.json()).toMatchObject({
		message: "steeringMode cannot take that value.",
	});
});
