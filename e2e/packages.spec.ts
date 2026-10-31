import { expect, test } from "./support/test";

import { resolve } from "node:path";

import { query, readJson, trustProject } from "./support/app";
import {
	AGENT_HOME,
	LOCAL_PACKAGE,
	PROJECT,
	PROJECT_SETTINGS_FILE,
	SECOND_PACKAGE,
	SETTINGS_FILE,
} from "./support/home";
import { EXPECTED_FAILURE } from "./support/test";

type SettingsFile = { packages?: string[]; extensions?: string[] };

const globalSettings = () => readJson<SettingsFile>(SETTINGS_FILE);
const projectSettings = () => readJson<SettingsFile>(PROJECT_SETTINGS_FILE);

/** pi may store a local source relative to the file that declares it. */
const declares = (entries: readonly string[], base: string, source: string): boolean =>
	entries.some((entry) => resolve(base, entry) === resolve(source));

const globalDeclares = async (source: string): Promise<boolean> =>
	declares((await globalSettings()).packages ?? [], AGENT_HOME, source);

const projectDeclares = async (source: string): Promise<boolean> =>
	declares((await projectSettings()).packages ?? [], resolve(PROJECT, ".pi"), source);

const packagesPage = "/settings/packages";

async function install(page: import("@playwright/test").Page, source: string): Promise<void> {
	await page.getByRole("button", { name: "Install package" }).click();
	const dialog = page.getByRole("dialog", { name: "Install package" });
	await dialog.getByRole("textbox", { name: "Source" }).fill(source);
	await dialog.getByRole("button", { name: "Install", exact: true }).click();
}

test.describe.serial("packages", () => {
	test("the list shows the declared package, its line, and filters", async ({ page }) => {
		await page.goto(packagesPage);
		await expect(page).toHaveTitle("Packages · Settings");
		await expect(page.getByRole("heading", { name: "Packages", exact: true })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Global" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /e2e-package/u })).toBeVisible();

		await page.getByRole("textbox", { name: "Search packages" }).fill("nothing-matches");
		await expect(page.getByText("Nothing matches")).toBeVisible();
		await page.getByRole("textbox", { name: "Search packages" }).fill("e2e-package");
		await expect(page.getByRole("link", { name: /e2e-package/u })).toBeVisible();
	});

	test("a package's detail names its scope and what it provides", async ({ page }) => {
		await page.goto(packagesPage);
		await page
			.getByRole("link", { name: /e2e-package/u })
			.first()
			.click();
		await expect(page.getByRole("heading", { name: LOCAL_PACKAGE, exact: true })).toBeVisible();
		await expect(page.getByText("Global", { exact: true }).last()).toBeVisible();
		await expect(page.getByRole("heading", { name: "Provides" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
		await expect(page.getByText("package-skill", { exact: true })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Prompts" })).toBeVisible();
		await expect(page.getByText(/fixture/u).first()).toBeVisible();

		// A package skill opens through its path, which is the only identity it has.
		await page.getByRole("link", { name: "Open" }).click();
		await expect(page).toHaveURL(/\/settings\/skills\/package-skill\?path=/u);
		await expect(page.getByText("Read-only: installed by a package.")).toBeVisible();
		await page.goBack();
		await expect(page).toHaveURL(/\/settings\/packages\/user\//u);
	});

	test(
		"an install that pi refuses is named and writes nothing",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(packagesPage);
			await install(page, "/no/such/pi-package");
			const dialog = page.getByRole("dialog", { name: "Install package" });
			await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 60_000 });
			expect((await globalSettings()).packages).toEqual([LOCAL_PACKAGE]);
		},
	);

	test("removing the last package leaves the empty state and a clean settings file", async ({
		page,
	}) => {
		await page.goto(packagesPage);
		await page
			.getByRole("link", { name: /e2e-package/u })
			.first()
			.click();
		await page.getByRole("button", { name: "Remove package" }).click();
		const dialog = page.getByRole("alertdialog", { name: /Remove .*e2e-package/u });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect((await globalSettings()).packages).toEqual([LOCAL_PACKAGE]);

		await page.getByRole("button", { name: "Remove package" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL(/\/settings\/packages$/u);
		await expect(page.getByText("No packages installed")).toBeVisible();
		await expect.poll(async () => (await globalSettings()).packages ?? []).toEqual([]);
	});

	test("installing the local package again makes it available and resolvable", async ({ page }) => {
		await page.goto(packagesPage);
		await install(page, LOCAL_PACKAGE);
		await expect(page.getByRole("dialog", { name: "Install package" })).toHaveCount(0, {
			timeout: 60_000,
		});
		await expect(page.getByRole("link", { name: /e2e-package/u })).toBeVisible();
		await expect.poll(() => globalDeclares(LOCAL_PACKAGE)).toBe(true);

		await page
			.getByRole("link", { name: /e2e-package/u })
			.first()
			.click();
		await expect(page.getByText("package-skill", { exact: true })).toBeVisible();
	});

	test("a project install writes the project's settings, not the home's", async ({ page }) => {
		await trustProject(page, PROJECT);
		await page.goto(`${packagesPage}?project=${query(PROJECT)}`);
		await expect(page.getByRole("tab", { name: "Project" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByText("No packages installed")).toBeVisible();

		await install(page, SECOND_PACKAGE);
		await expect(page.getByRole("dialog", { name: "Install package" })).toHaveCount(0, {
			timeout: 60_000,
		});
		await expect.poll(() => projectDeclares(SECOND_PACKAGE)).toBe(true);
		// The project's extension switch stays as it was, and the home gains nothing.
		expect((await projectSettings()).extensions).toEqual(["-builtin:mcp"]);
		expect(await globalDeclares(LOCAL_PACKAGE)).toBe(true);
		expect(await globalDeclares(SECOND_PACKAGE)).toBe(false);

		await page
			.getByRole("link", { name: /e2e-second-package/u })
			.first()
			.click();
		await expect(page.getByRole("heading", { name: /e2e-second-package/u })).toBeVisible();
		await expect(page.getByText("Project", { exact: true }).last()).toBeVisible();
		await expect(page.getByText("second-package-skill", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Remove package" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL((url) => url.pathname === packagesPage);
		await expect.poll(async () => (await projectSettings()).packages ?? []).toEqual([]);
		expect((await projectSettings()).extensions).toEqual(["-builtin:mcp"]);
	});

	test(
		"a package that is not declared anywhere shows Not found",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(`${packagesPage}/user/${query(LOCAL_PACKAGE)}-missing`);
			await expect(page.getByText("Not found")).toBeVisible();
		},
	);
});
