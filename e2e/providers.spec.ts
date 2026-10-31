import { EXPECTED_FAILURE, expect, test } from "./support/test";

import { readJson, readText, fileContains } from "./support/app";
import { COMMANDCODE_KEY, LIVE, LIVE_REASON, MODELS_FILE, AGENT_HOME } from "./support/home";
import { join } from "node:path";

type ProviderEntry = {
	name?: string;
	baseUrl?: string;
	api?: string;
	apiKey?: string;
	headers?: Record<string, string>;
	modelOverrides?: Record<string, { name?: string }>;
	compat?: { supportsDeveloperRole?: boolean };
	models?: { id: string; name?: string; reasoning?: boolean }[];
};

const providersFile = async () =>
	readJson<{ providers: Record<string, ProviderEntry> }>(MODELS_FILE);

const providersPage = "/settings/providers";

const apiSelect = (page: import("@playwright/test").Page) =>
	page.getByRole("combobox", { name: "API" });

/** The add flow, as far as a custom provider's blank page. */
async function openNewProvider(page: import("@playwright/test").Page): Promise<void> {
	await page.goto(providersPage);
	await page.getByRole("button", { name: /Add provider/u }).click();
	await page.getByRole("menuitem", { name: "With an API key" }).click();
	const add = page.getByRole("dialog", { name: "Add a provider with a key" });
	await expect(add).toBeVisible();
	await add.getByRole("button", { name: /Custom provider/u }).click();
	await expect(page).toHaveURL(/\/settings\/providers\/new$/u);
}

/** Fill the fields every custom provider needs, leaving the model list untouched. */
async function fillConnection(
	page: import("@playwright/test").Page,
	{ name, baseUrl, key }: { name: string; baseUrl: string; key?: string },
): Promise<void> {
	await page.getByRole("textbox", { name: "Display name" }).fill(name);
	await apiSelect(page).click();
	await page.getByRole("option", { name: /OpenAI Chat Completions/u }).click();
	await page.getByRole("textbox", { name: "Base URL" }).fill(baseUrl);
	if (key !== undefined) await page.getByLabel("API key").fill(key);
}

const BASE_URL = "https://api.commandcode.ai/provider/v1";
const MODEL_NAME = "E2E Flash";

test.describe.serial("providers editor", () => {
	test("the list shows what is configured, and the add flow offers both ways", async ({ page }) => {
		await page.goto(providersPage);
		await expect(page).toHaveTitle("Providers · Settings");
		await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
		await expect(page.getByRole("link", { name: /Dead Provider/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /Delete Provider/u })).toBeVisible();

		await page.getByRole("textbox", { name: "Search providers" }).fill("dead");
		await expect(page.getByRole("link", { name: /Dead Provider/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /Delete Provider/u })).toHaveCount(0);
		await page.getByRole("textbox", { name: "Search providers" }).fill("nothing-matches");
		await expect(page.getByText("Nothing matches.")).toBeVisible();

		await page.getByRole("button", { name: /Add provider/u }).click();
		await expect(page.getByRole("menuitem", { name: "With an API key" })).toBeVisible();
		await page.getByRole("menuitem", { name: "Sign in with an account" }).click();
		const account = page.getByRole("dialog", { name: "Sign in to a provider" });
		await expect(account).toBeVisible();
		// An account list never offers the custom endpoint: it has no account sign-in.
		await expect(account.getByRole("button", { name: /Custom provider/u })).toHaveCount(0);
		await account.getByRole("textbox", { name: "Search providers" }).fill("zzz-nothing");
		await expect(account.getByText("No provider signs in to an account")).toBeVisible();
		await account.getByRole("button", { name: "Cancel" }).click();

		await page.getByRole("button", { name: /Add provider/u }).click();
		await page.getByRole("menuitem", { name: "With an API key" }).click();
		const byKey = page.getByRole("dialog", { name: "Add a provider with a key" });
		await byKey.getByRole("textbox", { name: "Search providers" }).fill("no-such-provider");
		await expect(byKey.getByText("No provider matches")).toBeVisible();
	});

	test("an empty new provider shows every field error", async ({ page }) => {
		await openNewProvider(page);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("A provider needs a name.")).toBeVisible();
		await expect(page.getByText("A custom provider needs a base URL.")).toBeVisible();
		await expect(page.getByText("Choose the API family this provider speaks.")).toBeVisible();
		await expect(page).toHaveURL(/\/settings\/providers\/new$/u);

		// An incomplete header row is refused before anything is written.
		await page.getByRole("button", { name: /Add custom headers/u }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(
			page.getByText("Fill the header name and value, or remove the row."),
		).toBeVisible();
		await expect.poll(async () => (await providersFile()).providers["e2e-real"]).toBeUndefined();
	});

	test("create a provider with a key, a header, and a reasoning model", async ({ page }) => {
		await openNewProvider(page);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("A provider needs a name.")).toBeVisible();

		await fillConnection(page, {
			name: "E2E Real",
			baseUrl: BASE_URL,
			key: COMMANDCODE_KEY ?? "e2e-placeholder-key",
		});

		await page.getByRole("button", { name: /Add custom headers/u }).click();
		await page.getByRole("textbox", { name: "Header name" }).fill("X-E2E");
		await page.getByRole("textbox", { name: "Header value" }).fill("header-value");

		await page.getByRole("button", { name: "Add model" }).click();
		const addModel = page.getByRole("dialog", { name: "Add a model" });
		await addModel.getByRole("button", { name: "Save model" }).click();
		await expect(addModel.getByText("A model needs an id.")).toBeVisible();
		await addModel.getByRole("textbox", { name: "Model id" }).fill("deepseek/deepseek-v4.1-flash");
		await addModel.getByRole("textbox", { name: "Display name" }).fill(MODEL_NAME);
		await addModel.getByRole("textbox", { name: "Context window" }).fill("1000000");
		await addModel.getByRole("checkbox", { name: "Reasoning model" }).click();
		await addModel.getByRole("button", { name: "Save model" }).click();
		await expect(page.getByRole("heading", { name: "Models (1)" })).toBeVisible();
		await expect(page.getByText(MODEL_NAME)).toBeVisible();

		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page).toHaveURL(/\/settings\/providers\/e2e-real$/u);
		await expect(page.getByRole("heading", { name: "E2E Real" })).toBeVisible();
		await expect(page).toHaveTitle("e2e-real · Providers · Settings");

		await expect
			.poll(async () => (await providersFile()).providers["e2e-real"]?.name)
			.toBe("E2E Real");
		await fileContains(MODELS_FILE, "header-value");
		const entry = (await providersFile()).providers["e2e-real"];
		expect(entry).toMatchObject({
			name: "E2E Real",
			baseUrl: BASE_URL,
			api: "openai-completions",
			apiKey: COMMANDCODE_KEY ?? "e2e-placeholder-key",
			headers: { "X-E2E": "header-value" },
			models: [{ id: "deepseek/deepseek-v4.1-flash", name: MODEL_NAME, reasoning: true }],
		});
		// The stored key never travels back; the field starts empty with a hint instead.
		await expect(page.getByLabel("API key")).toHaveValue("");
		await expect(page.getByLabel("API key")).toHaveAttribute(
			"placeholder",
			"Saved key — type to replace",
		);
		if (COMMANDCODE_KEY !== undefined) {
			await expect(page.getByText(COMMANDCODE_KEY)).toHaveCount(0);
		}
	});

	test("editing keeps the stored key and refuses a repeated endpoint path", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-real`);
		const name = page.getByRole("textbox", { name: "Display name" });
		await expect(name).toHaveValue("E2E Real");

		await page.getByRole("textbox", { name: "Base URL" }).fill(`${BASE_URL}/chat/completions`);
		await expect(page.getByText(/should not end in/u)).toBeVisible();
		await page.getByRole("textbox", { name: "Base URL" }).fill(BASE_URL);

		await name.fill("E2E Real Renamed");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("heading", { name: "E2E Real Renamed" })).toBeVisible();
		await expect(page).toHaveURL(/\/settings\/providers\/e2e-real$/u);

		const entry = (await providersFile()).providers["e2e-real"];
		expect(entry?.name).toBe("E2E Real Renamed");
		expect(entry?.apiKey).toBe(COMMANDCODE_KEY ?? "e2e-placeholder-key");
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
			"E2E Real Renamed",
		);
	});

	test("a duplicate name is refused while a stored key stays blank", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-real`);
		await page.getByRole("textbox", { name: "Display name" }).fill("Dead Provider");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("Provider names must be unique.")).toBeVisible();
		expect((await providersFile()).providers["e2e-real"]?.name).toBe("E2E Real Renamed");
	});

	test("a stored header is kept by a blank value and removed with its row", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-real`);
		// The value never travels back, so blank means "keep the stored one".
		await expect(page.getByRole("textbox", { name: "Header value" })).toHaveValue("");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await providersFile()).providers["e2e-real"]?.headers)
			.toEqual({ "X-E2E": "header-value" });

		await page.getByRole("button", { name: "Remove X-E2E" }).click();
		await expect(page.getByRole("textbox", { name: "Header name" })).toHaveCount(0);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await providersFile()).providers["e2e-real"]?.headers)
			.toBeUndefined();
	});

	test("adding, editing and removing a model leaves the file in step", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-real`);
		await page.getByRole("button", { name: "Add model" }).click();
		const dialog = page.getByRole("dialog", { name: "Add a model" });
		await dialog.getByRole("textbox", { name: "Model id" }).fill("qwen/qwen3.7-flash");
		await dialog.getByRole("textbox", { name: "Display name" }).fill("E2E Qwen");
		await dialog.getByRole("button", { name: "Save model" }).click();
		await expect(page.getByRole("heading", { name: "Models (2)" })).toBeVisible();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await providersFile()).providers["e2e-real"]?.models?.length)
			.toBe(2);

		// The id is fixed once written; the label is what an edit changes.
		await page.getByRole("button", { name: "Edit E2E Qwen" }).click();
		const edit = page.getByRole("dialog", { name: "Edit model" });
		await expect(edit.getByRole("textbox", { name: "Model id" })).toBeDisabled();
		await edit.getByRole("textbox", { name: "Display name" }).fill("E2E Qwen Edited");
		await edit.getByRole("button", { name: "Save model" }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () =>
				(await providersFile()).providers["e2e-real"]?.models?.find(
					(model) => model.id === "qwen/qwen3.7-flash",
				),
			)
			.toMatchObject({ name: "E2E Qwen Edited" });

		await page.getByRole("button", { name: "Remove E2E Qwen Edited" }).click();
		// The row animates out before the draft drops it; saving mid-animation keeps it.
		await expect(page.getByRole("heading", { name: "Models (1)" })).toBeVisible();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () =>
				(await providersFile()).providers["e2e-real"]?.models?.map((model) => model.id),
			)
			.toEqual(["deepseek/deepseek-v4.1-flash"]);
	});

	test(
		"a built-in account provider leads with its sign-in, not an endpoint",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(providersPage);
			await page.getByRole("button", { name: /Add provider/u }).click();
			await page.getByRole("menuitem", { name: "Sign in with an account" }).click();
			const dialog = page.getByRole("dialog", { name: "Sign in to a provider" });
			await dialog.getByRole("textbox", { name: "Search providers" }).fill("OpenAI");
			await dialog.getByRole("button", { name: /^OpenAI Sign in with ChatGPT/u }).click();

			await expect(page).toHaveURL(/\/settings\/providers\/openai$/u);
			await expect(page.getByRole("dialog", { name: "Sign in to a provider" })).toHaveCount(0);
			const main = page.getByRole("main");
			await expect(main.getByRole("heading", { name: "OpenAI", exact: true })).toBeVisible();
			await expect(main.getByText("No credential yet")).toBeVisible();
			await expect(main.getByRole("button", { name: "Sign in with ChatGPT" })).toBeVisible();
			// The endpoint and key are an override behind a closed card for an account provider.
			await expect(main.getByRole("button", { name: "Endpoint, key and headers" })).toBeVisible();
			await expect(main.getByLabel("API key")).toHaveCount(0);
		},
	);

	test(
		"a built-in provider takes a key without replacing pi's catalog",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(providersPage);
			await page.getByRole("button", { name: /Add provider/u }).click();
			await page.getByRole("menuitem", { name: "With an API key" }).click();
			const dialog = page.getByRole("dialog", { name: "Add a provider with a key" });
			await dialog.getByRole("textbox", { name: "Search providers" }).fill("OpenAI");
			await dialog.getByRole("button", { name: /^OpenAI openai/u }).click();
			await expect(page).toHaveURL(/\/settings\/providers\/openai$/u);
			await expect(page.getByRole("heading", { name: "OpenAI", exact: true })).toBeVisible();

			await page.getByRole("button", { name: "Endpoint, key and headers" }).click();
			await page.getByLabel("API key").fill("e2e-builtin-key");
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect(page.getByText("The key in models.json is in use")).toBeVisible();

			await expect
				.poll(async () => (await providersFile()).providers["openai"])
				.toEqual({ apiKey: "e2e-builtin-key" });

			// A pi-shipped model is changed field by field, never replaced by a catalog.
			await page.getByRole("button", { name: "Override GPT-4o", exact: true }).click();
			const override = page.getByRole("dialog", { name: "Override GPT-4o", exact: true });
			await override.getByRole("textbox", { name: "Display name" }).fill("GPT-4o E2E");
			await override.getByRole("button", { name: "Save model" }).click();
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect
				.poll(async () => (await providersFile()).providers["openai"]?.modelOverrides)
				.toMatchObject({ "gpt-4o": { name: "GPT-4o E2E" } });

			await page.getByRole("button", { name: "Delete", exact: true }).click();
			await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
			await expect(page).toHaveURL(/\/settings\/providers$/u);
			await expect.poll(async () => (await providersFile()).providers["openai"]).toBeUndefined();
		},
	);

	test("an unsaved provider edit stays on Stay and reverts on Discard", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-real`);
		const name = page.getByRole("textbox", { name: "Display name" });
		await expect(name).toHaveValue("E2E Real Renamed");
		await name.fill("E2E Real edited");

		await page.getByRole("link", { name: "General" }).click();
		await expect(page.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
		await page.getByRole("button", { name: "Stay" }).click();
		await expect(page).toHaveURL(/\/settings\/providers\/e2e-real$/u);
		await expect(name).toHaveValue("E2E Real edited");

		await page.getByRole("link", { name: "General" }).click();
		await page.getByRole("button", { name: "Discard changes" }).click();
		await expect(page).toHaveURL(/\/settings\/general$/u);

		await page.goto(`${providersPage}/e2e-real`);
		await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
			"E2E Real Renamed",
		);
	});

	test("a model test reaches the real endpoint and reports its reasoning", async ({ page }) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto(`${providersPage}/e2e-real`);
		await page.getByRole("button", { name: "Test a model" }).click();
		await page.getByRole("combobox", { name: "Reasoning level" }).click();
		await page.getByRole("option", { name: "High", exact: true }).click();
		await page.getByRole("option", { name: new RegExp(MODEL_NAME, "u") }).click();

		const notice = page.getByRole("alert").filter({ hasText: "Reached" }).first();
		await expect(notice).toBeVisible({ timeout: 60_000 });
		await expect(notice).toContainText("with the saved credential at high");
		await expect(notice).toContainText(/\d+ reasoning tokens/u);
		// A test writes nothing: no key was typed, so models.json is untouched.
		expect((await providersFile()).providers["e2e-real"]?.apiKey).toBe(COMMANDCODE_KEY);
	});

	test("fetching the model list from the provider adds the models that were picked", async ({
		page,
	}) => {
		test.skip(!LIVE, LIVE_REASON);
		await page.goto(`${providersPage}/e2e-real`);
		await page.getByRole("button", { name: "Fetch models from provider" }).click();
		const dialog = page.getByRole("dialog", { name: "Fetch models from provider" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("https://api.commandcode.ai/provider/v1/models")).toBeVisible();
		await expect(dialog.getByRole("checkbox").first()).toBeVisible({ timeout: 30_000 });
		expect(await dialog.getByRole("checkbox").count()).toBeGreaterThan(5);

		await dialog.getByRole("button", { name: "Add selected" }).click();
		await expect(dialog).toHaveCount(0);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => (await providersFile()).providers["e2e-real"]?.models?.length ?? 0)
			.toBeGreaterThan(5);
	});

	test("deleting a provider asks first and leaves auth.json alone", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-delete`);
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		const dialog = page.getByRole("alertdialog", { name: "Remove Delete Provider?" });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect((await providersFile()).providers["e2e-delete"]).toBeDefined();

		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL(/\/settings\/providers$/u);
		await expect(page.getByRole("link", { name: /Delete Provider/u })).toHaveCount(0);
		await expect.poll(async () => (await providersFile()).providers["e2e-delete"]).toBeUndefined();
		expect(await readText(join(AGENT_HOME, "auth.json"))).toBe("{}\n");
	});
});

test.describe("provider failure surfaces", () => {
	test.use({ consoleErrors: "ignore" });

	test("an unknown provider id shows the pane's error, not a blank form", async ({ page }) => {
		await page.goto(`${providersPage}/nope`);
		await expect(page.getByRole("heading", { name: "Provider", exact: true })).toBeVisible();
		await expect(page.getByText("Not found")).toBeVisible();
		await expect(page.getByText("No such provider")).toBeVisible();
	});

	test("a dead provider's test fails in the page and writes nothing", async ({ page }) => {
		await page.goto(`${providersPage}/e2e-dead`);
		await page.getByRole("button", { name: "Test a model" }).click();
		await page.getByRole("option", { name: /Dead Model/u }).click();

		const notice = page
			.getByRole("alert")
			.filter({ hasText: /failed/u })
			.first();
		await expect(notice).toBeVisible({ timeout: 60_000 });
		await expect(notice).toContainText("The model test failed with the saved credential");
		await expect(notice).toContainText("Connection error");
		const dead = (await providersFile()).providers["e2e-dead"];
		expect(dead?.baseUrl).toBe("http://127.0.0.1:9/v1");
	});
});
