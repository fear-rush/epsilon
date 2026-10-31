import { EXPECTED_FAILURE, expect, test } from "./support/test";

import { fileContains, readJson, readText } from "./support/app";
import {
	AGENT_HOME,
	PINNED_ID,
	PROJECT,
	PROJECT_MCP_FILE,
	MCP_FILE,
	PROJECT_TWO,
} from "./support/home";
import { query, trustProject } from "./support/app";

type McpEntry = {
	url?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	headers?: Record<string, string>;
	description?: string;
	enabled?: boolean;
	exposure?: string;
	timeout?: number;
	oauth?: { clientId?: string; callbackPort?: number };
	auth?: { provider?: string };
	toolExposure?: Record<string, string>;
};

type McpFile = {
	autoEnableCodemode?: boolean;
	mcpServers?: Record<string, McpEntry>;
};

const globalMcp = () => readJson<McpFile>(MCP_FILE);
const projectMcp = () => readJson<McpFile>(PROJECT_MCP_FILE);

const mcpPage = "/settings/mcp";

/** Open the add dialog on one tab, after closing whatever state a previous test left. */
async function openAdd(page: import("@playwright/test").Page): Promise<void> {
	await page.goto(mcpPage);
	await page.getByRole("button", { name: "Add MCP server" }).click();
	await expect(page.getByRole("dialog", { name: "Add MCP server" })).toBeVisible();
}

async function addUrlServer(
	page: import("@playwright/test").Page,
	name: string,
	url: string,
	scope?: "Global" | "project",
): Promise<void> {
	await page.getByRole("tab", { name: "URL" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill(name);
	await page.getByRole("textbox", { name: "URL" }).fill(url);
	await page.getByRole("button", { name: "Next" }).click();
	if (scope !== undefined) await page.getByRole("radio", { name: scope, exact: true }).click();
	await page.getByRole("button", { name: "Add server" }).click();
}

const rawEditor = (page: import("@playwright/test").Page) =>
	page.getByRole("textbox", { name: "MCP server JSON" });

test.describe.serial("MCP editor", () => {
	test("the list shows every entry, its problem, and filters by what it says", async ({ page }) => {
		await page.goto(mcpPage);
		await expect(page).toHaveTitle("MCP servers · Settings");
		await expect(page.getByRole("heading", { name: "MCP servers" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Global" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /e2e-disabled/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-stdio/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-headers/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-broken/u })).toContainText(
			"url must be an http or https URL.",
		);

		await page.getByRole("textbox", { name: "Search MCP servers" }).fill("headers");
		await expect(page.getByRole("link", { name: /e2e-headers/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-stdio/u })).toHaveCount(0);
		await page.getByRole("textbox", { name: "Search MCP servers" }).fill("nothing-matches");
		await expect(page.getByText("Nothing matches.")).toBeVisible();

		// The file-level switch is pi's default until it is turned off.
		const auto = page.getByRole("switch", { name: "Auto-enable codemode" });
		await expect(auto).toBeChecked();
		await auto.click();
		await expect(auto).not.toBeChecked();
		await expect.poll(async () => (await globalMcp()).autoEnableCodemode).toBe(false);
		await auto.click();
		await expect(auto).toBeChecked();
		await expect.poll(async () => (await globalMcp()).autoEnableCodemode).toBeUndefined();
	});

	test("a URL server is added, switched, and fully edited", async ({ page }) => {
		await openAdd(page);
		await addUrlServer(page, "e2e-url", "https://example.com/mcp");

		await expect(page).toHaveURL(/\/settings\/mcp\/global\/e2e-url$/u);
		await expect(page.getByRole("heading", { name: "e2e-url", exact: true })).toBeVisible();
		await expect(page).toHaveTitle("e2e-url · MCP servers · Settings");

		let entry = (await globalMcp()).mcpServers?.["e2e-url"];
		expect(entry).toMatchObject({ url: "https://example.com/mcp" });
		expect(entry?.enabled).toBeUndefined();
		expect(entry?.exposure).toBeUndefined();

		// Off writes the key; on deletes it, which is pi's own convention.
		await page.getByRole("switch", { name: "Disable e2e-url" }).click();
		await expect.poll(async () => (await globalMcp()).mcpServers?.["e2e-url"]?.enabled).toBe(false);
		await page.getByRole("switch", { name: "Enable e2e-url" }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-url"]?.enabled)
			.toBeUndefined();

		await page.getByRole("textbox", { name: "Description" }).fill("A served fixture");
		await page.getByRole("combobox", { name: "Exposure" }).click();
		await page.getByRole("option", { name: "On request" }).click();
		await page.getByRole("button", { name: "Add header" }).click();
		await page.getByRole("textbox", { name: "Header name" }).fill("X-Token");
		await page.getByRole("textbox", { name: "Header value" }).fill("token-value");
		await page.getByRole("button", { name: "Advanced" }).click();
		await page.getByRole("textbox", { name: "Request timeout (seconds)" }).fill("25");
		await page.getByRole("button", { name: "Save", exact: true }).click();

		await fileContains(MCP_FILE, '"X-Token"');
		entry = (await globalMcp()).mcpServers?.["e2e-url"];
		expect(entry).toMatchObject({
			url: "https://example.com/mcp",
			description: "A served fixture",
			exposure: "deferred",
			timeout: 25,
			headers: { "X-Token": "token-value" },
		});
		await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
			"A served fixture",
		);
	});

	test("a command server keeps its arguments and environment", async ({ page }) => {
		await openAdd(page);
		await page.getByRole("tab", { name: "Command" }).click();
		await page.getByRole("textbox", { name: "Name" }).fill("e2e-command");
		await page.getByRole("textbox", { name: "Command" }).fill("cat");
		await page.getByRole("textbox", { name: "Arguments" }).fill("arg-one\narg-two");
		await page.getByRole("button", { name: "Next" }).click();
		await page.getByRole("button", { name: "Add server" }).click();
		await expect(page).toHaveURL(/\/settings\/mcp\/global\/e2e-command$/u);

		await expect(page.getByRole("textbox", { name: "Command" })).toHaveValue("cat");
		await page.getByRole("textbox", { name: "Working directory" }).fill("packages/web");
		await page.getByRole("button", { name: "Add variable" }).click();
		await page.getByRole("textbox", { name: "Variable name" }).fill("E2E_ENV");
		await page.getByRole("textbox", { name: "Variable value" }).fill("env-value");

		await page.getByRole("button", { name: "Save", exact: true }).click();

		await fileContains(MCP_FILE, '"E2E_ENV"');
		expect((await globalMcp()).mcpServers?.["e2e-command"]).toMatchObject({
			command: "cat",
			args: ["arg-one", "arg-two"],
			cwd: "packages/web",
			env: { E2E_ENV: "env-value" },
		});

		// Switching transport without a target is refused, and switching back keeps the draft.
		await page.getByRole("combobox", { name: "Transport" }).click();
		await page.getByRole("option", { name: "URL (HTTP)" }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("An HTTP server needs a URL.")).toBeVisible();
		await page.getByRole("combobox", { name: "Transport" }).click();
		await page.getByRole("option", { name: "Command (stdio)" }).click();
		await expect(page.getByRole("textbox", { name: "Command" })).toHaveValue("cat");
	});

	test("a pasted config previews, asks for a missing value, and writes the entry", async ({
		page,
	}) => {
		await openAdd(page);
		await page.getByRole("tab", { name: "Paste" }).click();
		const paste = page.getByRole("textbox", { name: "Config" });

		await paste.fill(
			'{"mcpServers": {"pasted-one": {"command": "cat", "env": {"PASTED_ENV": ""}}, "pasted-two": {"url": "https://example.com/paste"}}}',
		);
		await expect(page.getByText("pasted-one", { exact: true })).toBeVisible();
		await expect(page.getByText("pasted-two", { exact: true })).toBeVisible();
		// Each server can be left out before anything is written.
		await page.getByRole("checkbox", { name: "Add pasted-two" }).click();
		await page.getByRole("button", { name: "Next" }).click();
		await page.getByRole("textbox", { name: "PASTED_ENV" }).fill("typed-env");
		await page.getByRole("button", { name: "Add server" }).click();

		await expect(page).toHaveURL(/\/settings\/mcp\/global\/pasted-one$/u);
		expect((await globalMcp()).mcpServers?.["pasted-one"]).toMatchObject({
			command: "cat",
			env: { PASTED_ENV: "typed-env" },
		});
		expect((await globalMcp()).mcpServers?.["pasted-two"]).toBeUndefined();
	});

	test("a paste that is not JSON is refused, and a taken name blocks the add", async ({ page }) => {
		await openAdd(page);
		await page.getByRole("tab", { name: "Paste" }).click();
		const paste = page.getByRole("textbox", { name: "Config" });

		await paste.fill("{ not json");
		await expect(page.getByText(/JSON|Expected|Unexpected/iu).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

		await paste.fill('{"mcpServers": {"e2e-stdio": {"command": "cat"}}}');
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page.getByText("e2e-stdio already exists in that file.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Add server" })).toBeDisabled();

		await page.getByRole("button", { name: "Back" }).click();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("dialog", { name: "Add MCP server" })).toHaveCount(0);
	});

	test("the raw tab hides stored secrets, refuses bad JSON, and saves the entry", async ({
		page,
	}) => {
		await page.goto(`${mcpPage}/global/e2e-headers`);
		await page.getByRole("tab", { name: "Raw" }).click();
		await expect(page.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true");
		await expect(rawEditor(page)).toContainText('"<stored>"');
		await expect(rawEditor(page)).not.toContainText("seeded-secret");

		await rawEditor(page).fill('{ "url": ');
		await expect(rawEditor(page)).toBeVisible();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText(/JSON|Unexpected|Expected/iu).first()).toBeVisible();
		expect((await globalMcp()).mcpServers?.["e2e-headers"]?.timeout).toBe(45);

		await rawEditor(page).fill(
			JSON.stringify(
				{
					url: "https://example.com/mcp",
					enabled: false,
					description: "A header fixture",
					exposure: "codemode",
					timeout: 31,
					headers: { Authorization: "<stored>" },
				},
				null,
				2,
			),
		);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-headers"]?.timeout)
			.toBe(31);
		// The placeholder kept the secret that never reached the browser.
		expect((await globalMcp()).mcpServers?.["e2e-headers"]?.headers).toEqual({
			Authorization: "Bearer seeded-secret",
		});
	});

	test("an invalid global entry is listed with pi's reason and repaired in place", async ({
		page,
	}) => {
		await page.goto(`${mcpPage}/global/e2e-broken`);
		const notice = page.getByRole("alert").filter({ hasText: "url must be an http or https URL." });
		await expect(notice).toBeVisible();
		await page.getByRole("textbox", { name: "URL" }).fill("https://example.com/fixed");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(notice).toHaveCount(0);
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-broken"]?.url)
			.toBe("https://example.com/fixed");
	});

	test("deleting a server asks first, then removes it from the file", async ({ page }) => {
		await page.goto(`${mcpPage}/global/e2e-url`);
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		const dialog = page.getByRole("alertdialog", { name: "Remove e2e-url?" });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect((await globalMcp()).mcpServers?.["e2e-url"]).toBeDefined();

		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL(/\/settings\/mcp$/u);
		await expect(page.getByRole("link", { name: /e2e-url/u })).toHaveCount(0);
		await expect.poll(async () => (await globalMcp()).mcpServers?.["e2e-url"]).toBeUndefined();
	});

	test("the seed's switch writes mcp.json and turns back off", async ({ page }) => {
		await page.goto(`${mcpPage}/global/e2e-disabled`);
		const toggle = page.getByRole("switch", { name: /e2e-disabled/u });
		await expect(toggle).not.toBeChecked();
		await toggle.click();
		await expect(toggle).toBeChecked();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-disabled"]?.enabled)
			.toBeUndefined();
		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-disabled"]?.enabled)
			.toBe(false);
	});

	test("a trusted project lists only its own file and says MCP is off there", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`${mcpPage}?project=${query(PROJECT)}`);
		await expect(page.getByRole("tab", { name: "Project" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("combobox", { name: "Project" })).toContainText("project");
		await expect(page.getByText(/MCP is off in settings.json/u)).toBeVisible();
		await expect(page.getByRole("link", { name: /project-only/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-stdio/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /project-broken/u })).toBeVisible();
		// The Global file's servers are not this tab's rows.
		await expect(page.getByRole("link", { name: /e2e-headers/u })).toHaveCount(0);
	});

	test("a project override can be switched and then handed back to the global file", async ({
		page,
	}) => {
		await trustProject(page, PROJECT);
		await page.goto(`${mcpPage}/project/e2e-stdio?project=${query(PROJECT)}`);
		await expect(page.getByRole("heading", { name: "e2e-stdio", exact: true })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Override", exact: true })).toBeVisible();
		await expect(page.getByRole("link", { name: "Open" })).toBeVisible();

		await page.getByRole("button", { name: "Use global setting" }).click();
		await expect(page).toHaveURL((url) => url.pathname === mcpPage);
		await expect.poll(async () => (await projectMcp()).mcpServers?.["e2e-stdio"]).toBeUndefined();
		expect((await globalMcp()).mcpServers?.["e2e-stdio"]).toBeDefined();
		await expect(page.getByRole("link", { name: /e2e-stdio/u })).toHaveCount(0);
	});

	test("adding a server from the project tab writes only the project file", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`${mcpPage}?project=${query(PROJECT)}`);
		const before = Object.keys((await globalMcp()).mcpServers ?? {}).length;
		await page.getByRole("button", { name: /Add to project/u }).click();
		await addUrlServer(page, "e2e-project-new", "https://example.com/project", "project");

		await expect(page).toHaveURL(
			(url) =>
				url.pathname === `${mcpPage}/project/e2e-project-new` &&
				url.searchParams.get("project") === PROJECT,
		);
		expect((await projectMcp()).mcpServers?.["e2e-project-new"]).toMatchObject({
			url: "https://example.com/project",
		});
		expect(Object.keys((await globalMcp()).mcpServers ?? {})).toHaveLength(before);
		expect((await globalMcp()).mcpServers?.["e2e-project-new"]).toBeUndefined();
	});

	test(
		"a project entry cannot carry a provider token, even through Raw",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await trustProject(page, PROJECT);
			await page.goto(`${mcpPage}/project/e2e-project-new?project=${query(PROJECT)}`);
			await page.getByRole("tab", { name: "Raw" }).click();
			await rawEditor(page).fill(
				JSON.stringify(
					{ url: "https://example.com/project", auth: { provider: "commandcode" } },
					null,
					2,
				),
			);
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect(
				page.getByRole("alert").filter({ hasText: "auth is only allowed in the global mcp.json." }),
			).toBeVisible();
			expect((await projectMcp()).mcpServers?.["e2e-project-new"]?.auth).toBeUndefined();
		},
	);

	test("an invalid project server is repaired, and an orphan override is refused", async ({
		page,
	}) => {
		await trustProject(page, PROJECT);
		await page.goto(`${mcpPage}/project/project-broken?project=${query(PROJECT)}`);
		await expect(
			page.getByRole("alert").filter({ hasText: "url must be an http or https URL." }),
		).toBeVisible();
		await page.getByRole("textbox", { name: "URL" }).fill("https://example.com/repaired");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await projectMcp()).mcpServers?.["project-broken"]?.url)
			.toBe("https://example.com/repaired");

		await page.goto(`${mcpPage}/project/orphan-override?project=${query(PROJECT)}`);
		await expect(
			page.getByRole("alert").filter({ hasText: /needs a global server of this name/u }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Use global setting" })).toBeDisabled();
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect
			.poll(async () => (await projectMcp()).mcpServers?.["orphan-override"])
			.toBeUndefined();
	});

	test("OAuth options and a provider token are validated before they are written", async ({
		page,
	}) => {
		await page.goto(`${mcpPage}/global/e2e-headers`);
		await page.getByRole("button", { name: "Advanced" }).click();
		await page.getByRole("textbox", { name: "Client ID" }).fill("e2e-client");
		await page.getByRole("textbox", { name: "Callback port" }).fill("0");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("oauth.callbackPort must be a port number.")).toBeVisible();

		await page.getByRole("textbox", { name: "Callback port" }).fill("3333");
		await page.getByRole("textbox", { name: "Auth provider" }).fill("nope");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText('pi has no provider "nope".')).toBeVisible();

		await page.getByRole("textbox", { name: "Auth provider" }).fill("commandcode");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-headers"]?.oauth)
			.toMatchObject({ clientId: "e2e-client", callbackPort: 3333 });
		expect((await globalMcp()).mcpServers?.["e2e-headers"]?.auth).toEqual({
			provider: "commandcode",
		});
	});

	test("a live stdio server registers its tool, and a rule hides it", async ({ page }) => {
		// The fixture server is a real MCP process; it stays off until this test so
		// every other chat starts without spawning one.
		await page.goto(`${mcpPage}/global/e2e-live`);
		await page.getByRole("switch", { name: "Enable e2e-live" }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-live"]?.enabled)
			.toBeUndefined();

		// A chat session is what connects a configured server and registers its tools.
		await page.goto(`/sessions/${PINNED_ID}`);
		await expect(page.getByText("Hello from Pinned chat")).toBeVisible();
		await expect
			.poll(
				async () => {
					const response = await page.request.get("/api/settings");
					// SAFETY: the settings route's documented snapshot, read only for mcpLive.
					const snapshot = (await response.json()) as {
						mcpLive: {
							sessions: number;
							codemode: boolean;
							servers: { name: string; tools: number; toolNames: string[] }[];
						};
					};
					return snapshot.mcpLive.servers.find((entry) => entry.name === "e2e-live");
				},
				{ timeout: 30_000 },
			)
			.toMatchObject({ tools: 1, toolNames: ["echo"] });

		await page.goto(`${mcpPage}/global/e2e-live`);
		await expect(page.getByText("echo", { exact: true })).toBeVisible({ timeout: 20_000 });
		const hide = page.getByRole("switch", { name: "Hide echo" });
		await expect(hide).toBeChecked();
		await hide.click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-live"]?.toolExposure)
			.toEqual({ echo: "hidden" });
		// A save reloads every live engine, so the tool list is read once more and the
		// switch settles from the file rather than mid-reload.
		await page.reload();
		await expect(page.getByText("echo", { exact: true })).toBeVisible({ timeout: 20_000 });
		await expect(page.getByRole("switch", { name: "Show echo" })).not.toBeChecked();

		await page.getByRole("switch", { name: "Show echo" }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-live"]?.toolExposure)
			.toBeUndefined();

		// Leave the server off for the specs after this one.
		await page.reload();
		await page.getByRole("switch", { name: "Disable e2e-live" }).click();
		await expect
			.poll(async () => (await globalMcp()).mcpServers?.["e2e-live"]?.enabled)
			.toBe(false);
	});

	test("an untouched project shows its own empty state, not the global list", async ({ page }) => {
		await trustProject(page, PROJECT_TWO);
		await page.goto(`${mcpPage}?project=${query(PROJECT_TWO)}`);
		await expect(page.getByText("No servers in this project.")).toBeVisible();
	});

	test("switching the tabs keeps each file's rows apart", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`${mcpPage}?project=${query(PROJECT)}`);
		await expect(page.getByRole("link", { name: /project-only/u })).toBeVisible();

		await page.getByRole("tab", { name: "Global" }).click();
		await expect(page).not.toHaveURL(/project=/u);
		await expect(page.getByRole("link", { name: /e2e-command/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /project-only/u })).toHaveCount(0);

		// The Project tab picks a recent folder, so only the URL's shape is guaranteed.
		await page.getByRole("tab", { name: "Project" }).click();
		await expect.poll(async () => new URL(page.url()).searchParams.get("project")).not.toBeNull();
	});
});

test.describe("MCP failure surfaces", () => {
	test.use({ consoleErrors: "ignore" });

	test("an unknown server name shows the pane's not-found state", async ({ page }) => {
		await page.goto(`${mcpPage}/global/nope`);
		await expect(page.getByRole("heading", { name: "nope", exact: true })).toBeVisible();
		await expect(page.getByText("Not found")).toBeVisible();
		await expect(page.getByText("No such MCP server")).toBeVisible();
	});

	test("a refused MCP read is shown in its pane", async ({ page }) => {
		await page.route("**/api/settings/mcp/global/e2e-stdio*", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ message: "The fixture MCP entry is broken." }),
			}),
		);
		await page.goto(`${mcpPage}/global/e2e-stdio`);
		await expect(page.getByText("The fixture MCP entry is broken.")).toBeVisible();
		expect(await readText(AGENT_HOME + "/mcp.json")).toContain("e2e-stdio");
	});
});
