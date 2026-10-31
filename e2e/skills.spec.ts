import { existsSync } from "node:fs";
import { join } from "node:path";

import { EXPECTED_FAILURE, expect, test } from "./support/test";

import { fileContains, query, readJson, readText, trustProject } from "./support/app";
import {
	AGENT_HOME,
	IMPORT_FOLDER,
	PROJECT,
	PROJECT_UNTRUSTED,
	SETTINGS_FILE,
	USER_HOME,
} from "./support/home";

const HOME_SKILLS = join(AGENT_HOME, "skills");
const USER_SKILLS = join(USER_HOME, ".agents", "skills");
const FOREIGN_SKILLS = join(USER_HOME, ".claude", "skills");

const created = join(HOME_SKILLS, "created-home", "SKILL.md");
const createdNote = join(HOME_SKILLS, "created-home", "references", "notes.md");
const agentsSkill = join(USER_SKILLS, "created-agents", "SKILL.md");
const projectSkill = join(PROJECT, ".agents", "skills", "created-project", "SKILL.md");

const skillsPage = "/settings/skills";

type SettingsFile = { skills?: string[] };

const settings = () => readJson<SettingsFile>(SETTINGS_FILE);

const skillEditor = (page: import("@playwright/test").Page, name: string) =>
	page.getByRole("textbox", { name, exact: true });

/** Fill the form of a new skill and save it; the caller asserts where it landed. */
async function createSkill(
	page: import("@playwright/test").Page,
	fields: { name: string; description: string; body: string },
): Promise<void> {
	await skillEditor(page, "Name").fill(fields.name);
	await skillEditor(page, "Description").fill(fields.description);
	await skillEditor(page, "Instructions").fill(fields.body);
	await page.getByRole("button", { name: "Save", exact: true }).click();
}

test.describe.serial("skills editor", () => {
	test("the list groups every origin, marks what pi refuses, and filters", async ({ page }) => {
		await page.goto(skillsPage);
		await expect(page).toHaveTitle("Skills · Settings");
		await expect(page.getByRole("tab", { name: "Global" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// One group per place pi looks: the home, ~/.agents/skills, packages.
		await expect(
			page.getByRole("heading", { name: new RegExp(`${HOME_SKILLS}$`, "u") }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: new RegExp(`${USER_SKILLS}$`, "u") }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-skill/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /agents-skill/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /package-skill/u })).toBeVisible();
		// A skill without a description is listed, dimmed, not hidden.
		await expect(page.getByRole("link", { name: /broken-skill/u })).toBeVisible();
		// Claude Code's folder is found, and pi does not load it until it is linked.
		await expect(page.getByText("Claude Code", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Link" })).toBeVisible();

		await page.getByRole("textbox", { name: "Search skills" }).fill("package");
		await expect(page.getByRole("link", { name: /package-skill/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /e2e-skill/u })).toHaveCount(0);
		await page.getByRole("textbox", { name: "Search skills" }).fill("nothing-matches");
		await expect(page.getByText("Nothing matches.")).toBeVisible();
	});

	test("a skill pi refused is shown with its reason and can be repaired", async ({ page }) => {
		await page.goto(`${skillsPage}/broken-skill?root=home`);
		await expect(page.getByRole("heading", { name: "broken-skill", exact: true })).toBeVisible();
		await expect(
			page
				.getByRole("alert")
				.filter({ hasText: /description/u })
				.first(),
		).toBeVisible();

		await skillEditor(page, "Description").fill("A description added during the run.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await fileContains(
			join(HOME_SKILLS, "broken-skill", "SKILL.md"),
			"A description added during the run.",
		);
		await expect(page.getByRole("alert").filter({ hasText: /description/u })).toHaveCount(0);
	});

	test("a new skill needs a name and a description before anything is written", async ({
		page,
	}) => {
		await page.goto(`${skillsPage}/new?root=home`);
		await expect(page).toHaveTitle("New skill · Settings");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("A skill needs a name.")).toBeVisible();
		await expect(page.getByText("Say what the skill does and when to use it.")).toBeVisible();

		await skillEditor(page, "Name").fill("Bad Name");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(
			page.getByText("Use lowercase letters, digits and single dashes, not at the start or end"),
		).toBeVisible();
		expect(existsSync(created)).toBe(false);
	});

	test("creating a home skill writes SKILL.md and lands on its page", async ({ page }) => {
		await page.goto(`${skillsPage}/new?root=home`);
		await createSkill(page, {
			name: "created-home",
			description: "A skill created by the browser.",
			body: "# Created home\n\nWritten from the form.",
		});
		await expect(page).toHaveURL(/\/settings\/skills\/created-home\?root=home$/u);
		await expect(page).toHaveTitle("created-home · Skills · Settings");
		await expect(page.getByRole("heading", { name: "created-home", exact: true })).toBeVisible();
		await expect(page.getByRole("link", { name: /created-home/u })).toBeVisible();

		await fileContains(created, "A skill created by the browser.");
		await fileContains(created, "Written from the form.");
		const text = await readText(created);
		expect(text.startsWith("---\nname: created-home\ndescription:")).toBe(true);
	});

	test("the form edits the description and whether the model may load it", async ({ page }) => {
		await page.goto(`${skillsPage}/created-home?root=home`);
		await skillEditor(page, "Description").fill("An edited description from the form.");
		await skillEditor(page, "Instructions").fill("# Edited\n\nThe edited body.");
		await page.getByRole("switch", { name: "Load automatically" }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();

		await fileContains(created, "disable-model-invocation: true");
		await fileContains(created, "An edited description from the form.");
		await expect(page.getByText("Unsaved changes")).toHaveCount(0);

		await page.getByRole("switch", { name: "Load automatically" }).click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(async () => readText(created)).not.toContain("disable-model-invocation");
	});

	test("a form save keeps the frontmatter keys the form does not manage", async ({ page }) => {
		await page.goto(`${skillsPage}/e2e-skill?root=home`);
		await expect(page.getByRole("heading", { name: "e2e-skill", exact: true })).toBeVisible();
		await skillEditor(page, "Description").fill("An edited seeded description.");
		await page.getByRole("button", { name: "Save", exact: true }).click();

		const file = join(HOME_SKILLS, "e2e-skill", "SKILL.md");
		await fileContains(file, "An edited seeded description.");
		const text = await readText(file);
		expect(text).toContain("license: MIT");
		expect(text).toContain("allowed-tools: Bash");
		expect(text).toContain("owner: e2e");
	});

	test("a skill's bundled files are added, edited, discarded and deleted", async ({ page }) => {
		await page.goto(`${skillsPage}/created-home?root=home`);

		// SKILL.md is the Instructions card, never a file to add.
		const path = page.getByRole("textbox", { name: "New file path" });
		await path.fill("SKILL.md");
		await page.getByRole("button", { name: "Add file" }).click();
		await expect(page.getByText("SKILL.md is edited in the form above.")).toBeVisible();

		await path.fill("references/notes.md");
		await page.getByRole("button", { name: "Add file" }).click();
		const dialog = page.getByRole("dialog", { name: "references/notes.md" });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("textbox", { name: "references/notes.md" }).fill("A note.\n");
		await dialog.getByRole("button", { name: "Save file" }).click();
		await expect(dialog.getByRole("button", { name: "Save file" })).toBeDisabled();
		await dialog.getByRole("button", { name: "Close" }).last().click();
		await fileContains(createdNote, "A note.");

		// Reopening reads the file back; Discard throws the edit away.
		await page
			.getByRole("button", { name: /references\/notes\.md/u })
			.first()
			.click();
		const reopened = page.getByRole("dialog", { name: "references/notes.md" });
		const note = reopened.getByRole("textbox", { name: "references/notes.md" });
		await expect(note).toContainText("A note.");
		await note.fill("A discarded note.");
		await reopened.getByRole("button", { name: "Discard" }).click();
		await expect(note).toContainText("A note.");
		await reopened.getByRole("button", { name: "Close" }).last().click();
		expect(await readText(createdNote)).toBe("A note.\n");

		await page.getByRole("button", { name: "Delete references/notes.md" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await expect(page.getByRole("button", { name: "references/notes.md" })).toHaveCount(0);
		await expect.poll(() => existsSync(createdNote)).toBe(false);
	});

	test(
		"the raw tab edits any file, keeps its tab in the URL, and checks SKILL.md",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(`${skillsPage}/created-home?root=home`);
			await page.getByRole("tab", { name: "Raw" }).click();
			await expect(page).toHaveURL(/tab=raw/u);

			// A bundled file is saved byte for byte through the raw route.
			await page.goto(`${skillsPage}/created-home?root=home&tab=raw&file=SKILL.md`);
			const editor = page.getByRole("textbox", { name: "SKILL.md" });
			await editor.fill(
				"---\nname: created-home\ndescription: A raw save from the browser.\n---\n\n# Raw body\n",
			);
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await fileContains(created, "A raw save from the browser.");
			await fileContains(created, "# Raw body");

			// The name in the frontmatter must equal the folder, or the write is refused.
			await editor.fill(
				"---\nname: another-name\ndescription: A mismatched raw save.\n---\n\n# Body\n",
			);
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect(
				page.getByRole("alert").filter({ hasText: /must match the folder name/u }),
			).toBeVisible();
			expect(await readText(created)).toContain("A raw save from the browser.");

			// A file that no longer parses is refused with pi's own sentence.
			await editor.fill("---\nname: created-home\n---\n\nNo description here.\n");
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect(
				page.getByRole("alert").filter({ hasText: /does not load a skill without a description/u }),
			).toBeVisible();

			await page.reload();
			await expect(page.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true");
			await expect(page.getByRole("textbox", { name: "SKILL.md" })).toContainText(
				"A raw save from the browser.",
			);
		},
	);

	test("a folder upload is staged, reviewed, and copied with its files", async ({ page }) => {
		await page.goto(skillsPage);
		await page.getByRole("button", { name: "Import" }).click();
		const dialog = page.getByRole("dialog", { name: "Import skills" });
		await expect(dialog).toBeVisible();
		await dialog.locator('input[aria-label="Skill folder"]').setInputFiles(IMPORT_FOLDER);
		await expect(dialog.getByText(/2 files/u)).toBeVisible();
		await dialog.getByRole("button", { name: "Continue" }).click();

		const found = dialog.getByRole("list", { name: "Skills found" });
		await expect(found).toBeVisible({ timeout: 20_000 });
		await expect(found.getByText("import-skill", { exact: true })).toBeVisible();
		await expect(dialog.getByText("Global (agent home)")).toBeVisible();
		await dialog.getByRole("button", { name: "Install", exact: true }).click();

		await expect(dialog).toHaveCount(0, { timeout: 20_000 });
		await fileContains(
			join(AGENT_HOME, "skills", "import-skill", "SKILL.md"),
			"A skill uploaded from a folder.",
		);
		await fileContains(
			join(AGENT_HOME, "skills", "import-skill", "references", "notes.md"),
			"The imported reference.",
		);
		await expect(page.getByRole("link", { name: /import-skill/u })).toBeVisible();
	});

	test("the loaded switch writes pi's skills setting and turns back on", async ({ page }) => {
		await page.goto(`${skillsPage}/created-home?root=home`);
		const toggle = page.getByRole("switch", { name: /created-home/u });
		await expect(toggle).toBeChecked();
		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await expect
			.poll(async () => (await settings()).skills ?? [])
			.toContain(`-${join(HOME_SKILLS, "created-home")}`);
		await expect(page.getByRole("link", { name: /created-home/u })).toBeVisible();

		await toggle.click();
		await expect(toggle).toBeChecked();
		await expect
			.poll(async () => (await settings()).skills ?? [])
			.not.toContain(`-${join(HOME_SKILLS, "created-home")}`);
	});

	test("a skill's foreign fields and body syntax are named as warnings", async ({ page }) => {
		await page.goto(`${skillsPage}/manual-skill?root=home`);
		await expect(
			page
				.getByRole("alert")
				.filter({ hasText: "pi ignores these Claude Code fields: when_to_use" }),
		).toBeVisible();
		await expect(
			page.getByRole("alert").filter({ hasText: /The body uses \$ARGUMENTS/u }),
		).toBeVisible();
	});

	test("a skill in ~/.agents/skills is created and edited on the user-agents root", async ({
		page,
	}) => {
		await page.goto(`${skillsPage}/new?root=user-agents`);
		await createSkill(page, {
			name: "created-agents",
			description: "A skill in the shared agents folder.",
			body: "# Shared\n",
		});
		await expect(page).toHaveURL(/\/settings\/skills\/created-agents\?root=user-agents$/u);
		await fileContains(agentsSkill, "A skill in the shared agents folder.");
		await expect(
			page.getByRole("heading", { name: new RegExp(`${USER_SKILLS}$`, "u") }),
		).toBeVisible();
	});

	test("linking a foreign folder makes its skills pi's, and unlinking removes them", async ({
		page,
	}) => {
		await page.goto(skillsPage);
		await expect(page.getByRole("button", { name: "Link" })).toBeVisible();
		await page.getByRole("button", { name: "Link" }).click();
		await expect(page.getByText("Linked", { exact: true })).toBeVisible();
		await expect.poll(async () => (await settings()).skills ?? []).toContain(FOREIGN_SKILLS);
		// Once linked, pi reads it as a settings path, so the inventory lists it.
		await expect(page.getByRole("link", { name: /foreign-skill/u })).toBeVisible();

		await page.getByRole("button", { name: "Unlink" }).click();
		await expect(page.getByRole("button", { name: "Link" })).toBeVisible();
		await expect.poll(async () => (await settings()).skills ?? []).not.toContain(FOREIGN_SKILLS);
	});

	test("a project's own skills are created in its .agents/skills and listed there", async ({
		page,
	}) => {
		await trustProject(page, PROJECT);
		await page.goto(`${skillsPage}?project=${query(PROJECT)}`);
		await expect(page.getByRole("tab", { name: "Project" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("link", { name: /project-skill/u })).toBeVisible();
		await expect(page.getByRole("link", { name: /project-agents-skill/u })).toBeVisible();
		// The project tab does not show the home's skills.
		await expect(page.getByRole("link", { name: /e2e-skill/u })).toHaveCount(0);

		await page.getByRole("link", { name: "Add skill" }).click();
		await expect(page).toHaveURL(/root=project-agents/u);
		await createSkill(page, {
			name: "created-project",
			description: "A skill created inside the project.",
			body: "# Project created\n",
		});
		await expect(page).toHaveURL(/project=/u);
		await fileContains(projectSkill, "A skill created inside the project.");
		await expect(page).toHaveURL((url) => url.searchParams.get("project") === PROJECT);
	});

	test(
		"an untrusted project's settings are refused in the pane",
		{ tag: EXPECTED_FAILURE },
		async ({ page }) => {
			await page.goto(`${skillsPage}?project=${query(PROJECT_UNTRUSTED)}`);
			await expect(page.getByText(/is not trusted yet/u)).toBeVisible();
			await expect(page.getByText(/Trust the folder/u)).toBeVisible();
		},
	);

	test("a package skill opens read-only and says who owns it", async ({ page }) => {
		await page.goto(skillsPage);
		await page.getByRole("link", { name: /package-skill/u }).click();
		await expect(page).toHaveTitle("package-skill · Skills · Settings");
		await expect(page.getByText("Read-only: installed by a package.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
		await expect(page.getByRole("switch", { name: /package-skill/u })).toBeDisabled();
	});

	test("deleting a skill removes its whole folder", async ({ page }) => {
		await page.goto(`${skillsPage}/created-home?root=home`);
		await page.getByRole("button", { name: "Delete" }).click();
		await expect(page.getByRole("alertdialog", { name: "Remove created-home?" })).toBeVisible();
		await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
		expect(existsSync(created)).toBe(true);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await expect(page).toHaveURL(/\/settings\/skills$/u);
		await expect(page.getByRole("link", { name: /created-home/u })).toHaveCount(0);
		await expect.poll(() => existsSync(join(HOME_SKILLS, "created-home"))).toBe(false);
	});
});

test.describe("skill failure surfaces", () => {
	test.use({ consoleErrors: "ignore" });

	test("an unknown skill name shows the pane's not-found state", async ({ page }) => {
		await page.goto(`${skillsPage}/nope?root=home`);
		await expect(page.getByText("Not found")).toBeVisible();
		await expect(page.getByText("No such skill")).toBeVisible();
	});
});
