import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { skillNameSchema } from "shared";
import { z } from "zod";

import type { Deps } from "../../deps";
import type { AgentHome } from "../../platform/agent-home";
import { configWrite, errorContent, failure, toError } from "../../platform/http";
import { settingsFolder, settingsScopeQuerySchema } from "../projects";
import {
	skillBundleFileInputSchema,
	skillBundleFileSchema,
	skillBundleListSchema,
	skillDocumentSchema,
	skillEnabledInputSchema,
	skillFileSchema,
	skillFolderInputSchema,
	skillInputSchema,
	skillRootSchema,
} from "./contract";
import {
	deleteSkillBundleFile,
	listListedSkillFiles,
	listSkillFiles,
	readListedSkillFile,
	readSkillBundleFile,
	writeSkillBundleFile,
} from "./files";
import { readRawSkill, writeRawSkill } from "./raw";
import { linkSkillFolder, unlinkSkillFolder } from "./foreign";
import { skillRootDir } from "./root";
import { listSkills } from "./inventory";
import { readSkillDocument, readSkillFile, removeSkill, writeSkill } from "./store";
import { setSkillEnabled } from "./toggle";

const skillParams = z.object({ root: skillRootSchema, name: skillNameSchema });

const skillPath = "/api/settings/skills/{root}/{name}";

const readSkillRoute = createRoute({
	method: "get",
	path: skillPath,
	tags: ["settings"],
	operationId: "readSkill",
	description:
		"One skill file for the edit form: managed fields, the fields it keeps untouched, or the raw text when the frontmatter does not parse",
	request: { params: skillParams, query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The skill file",
			content: { "application/json": { schema: skillFileSchema } },
		},
		400: { description: "The root or project cannot be used", content: errorContent },
		404: { description: "No such skill in that root", content: errorContent },
	},
});

const listedQuery = settingsScopeQuerySchema.extend({
	filePath: z
		.string()
		.min(1)
		.openapi({ description: "The SKILL.md path of a skill the inventory lists" }),
});

const readListedRoute = createRoute({
	method: "get",
	path: "/api/settings/skills/listed",
	tags: ["settings"],
	operationId: "readListedSkill",
	description:
		"The parsed SKILL.md of any skill the inventory lists, looked up by its file path, for display only. A path the inventory does not list is refused",
	request: { query: listedQuery },
	responses: {
		200: {
			description: "The skill file",
			content: { "application/json": { schema: skillDocumentSchema } },
		},
		400: { description: "The project cannot be used", content: errorContent },
		404: { description: "No listed skill has that path", content: errorContent },
	},
});

const writeSkillRoute = createRoute({
	method: "put",
	path: skillPath,
	tags: ["settings"],
	operationId: "writeSkill",
	description:
		"Create or update a skill in an editable root. Frontmatter keys the panel does not manage are kept; a file that does not parse is refused",
	request: {
		params: skillParams,
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: skillInputSchema } } },
	},
	responses: {
		204: { description: "The skill's SKILL.md is written, and live engines reloaded" },
		400: { description: "The skill was refused", content: errorContent },
	},
});

const deleteSkillRoute = createRoute({
	method: "delete",
	path: skillPath,
	tags: ["settings"],
	operationId: "deleteSkill",
	request: { params: skillParams, query: settingsScopeQuerySchema },
	responses: {
		204: { description: "The skill directory is gone" },
		400: { description: "The skill could not be removed", content: errorContent },
	},
});

const bundleFileQuery = settingsScopeQuerySchema.extend({
	path: z
		.string()
		.min(1)
		.openapi({ description: "The file's path inside the skill folder, with / between folders" }),
});

const listFilesRoute = createRoute({
	method: "get",
	path: `${skillPath}/files`,
	tags: ["settings"],
	operationId: "listSkillFiles",
	description:
		"Every file in one editable skill folder, SKILL.md included. Symlinks are not listed; skipped counts them",
	request: { params: skillParams, query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The files, sorted by path",
			content: { "application/json": { schema: skillBundleListSchema } },
		},
		400: { description: "The skill folder cannot be listed", content: errorContent },
	},
});

const readFileRoute = createRoute({
	method: "get",
	path: `${skillPath}/file`,
	tags: ["settings"],
	operationId: "readSkillBundleFile",
	description:
		"The text of one bundled file. SKILL.md, binary files and files over 1 MB are refused",
	request: { params: skillParams, query: bundleFileQuery },
	responses: {
		200: {
			description: "The file's text",
			content: { "application/json": { schema: skillBundleFileSchema } },
		},
		400: { description: "The file cannot be read", content: errorContent },
	},
});

const writeFileRoute = createRoute({
	method: "put",
	path: `${skillPath}/file`,
	tags: ["settings"],
	operationId: "writeSkillBundleFile",
	description:
		"Create or replace one bundled text file, creating its folders. SKILL.md, unsafe paths, symlinks and a skill folder over the size limit are refused",
	request: {
		params: skillParams,
		query: bundleFileQuery,
		body: {
			required: true,
			content: { "application/json": { schema: skillBundleFileInputSchema } },
		},
	},
	responses: {
		204: { description: "The file is written, and live engines reloaded" },
		400: { description: "The file was refused", content: errorContent },
	},
});

const deleteFileRoute = createRoute({
	method: "delete",
	path: `${skillPath}/file`,
	tags: ["settings"],
	operationId: "deleteSkillBundleFile",
	description: "Delete one bundled file and the folders it leaves empty. SKILL.md is refused",
	request: { params: skillParams, query: bundleFileQuery },
	responses: {
		204: { description: "The file is gone, and live engines reloaded" },
		400: { description: "The file could not be removed", content: errorContent },
	},
});

const readRawRoute = createRoute({
	method: "get",
	path: `${skillPath}/raw`,
	tags: ["settings"],
	operationId: "readSkillRaw",
	description: "The exact text of one editable skill's SKILL.md, frontmatter included",
	request: { params: skillParams, query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "The file's text",
			content: { "application/json": { schema: skillBundleFileSchema } },
		},
		400: { description: "The file cannot be read", content: errorContent },
	},
});

const writeRawRoute = createRoute({
	method: "put",
	path: `${skillPath}/raw`,
	tags: ["settings"],
	operationId: "writeSkillRaw",
	description:
		"Replace SKILL.md with the given text, byte for byte. The frontmatter must parse, its name must equal the folder name, and its description must pass the description rules",
	request: {
		params: skillParams,
		query: settingsScopeQuerySchema,
		body: {
			required: true,
			content: { "application/json": { schema: skillBundleFileInputSchema } },
		},
	},
	responses: {
		204: { description: "SKILL.md is written, and live engines reloaded" },
		400: { description: "The text was refused", content: errorContent },
	},
});

const listedFilesRoute = createRoute({
	method: "get",
	path: "/api/settings/skills/listed-files",
	tags: ["settings"],
	operationId: "listListedSkillFiles",
	description:
		"Every file in the folder of a skill the inventory lists, for display. A path the inventory does not list is refused",
	request: { query: listedQuery },
	responses: {
		200: {
			description: "The files, sorted by path",
			content: { "application/json": { schema: skillBundleListSchema } },
		},
		400: { description: "The skill folder cannot be listed", content: errorContent },
		404: { description: "No listed skill has that path", content: errorContent },
	},
});

const listedFileRoute = createRoute({
	method: "get",
	path: "/api/settings/skills/listed-file",
	tags: ["settings"],
	operationId: "readListedSkillFile",
	description:
		"The text of one file in the folder of a skill the inventory lists, SKILL.md included. Binary files, files over 1 MB and unsafe paths are refused",
	request: { query: listedQuery.extend({ path: bundleFileQuery.shape.path }) },
	responses: {
		200: {
			description: "The file's text",
			content: { "application/json": { schema: skillBundleFileSchema } },
		},
		400: { description: "The file cannot be read", content: errorContent },
		404: { description: "No listed skill has that path", content: errorContent },
	},
});

const enabledRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/enabled",
	tags: ["settings"],
	operationId: "setSkillEnabled",
	description:
		"Turn one listed skill off or on with a -path entry in the skills setting. A package skill is refused: turn it off from Packages",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: skillEnabledInputSchema } } },
	},
	responses: {
		204: { description: "The setting is written, and live engines reloaded" },
		400: { description: "The skill could not be switched", content: errorContent },
	},
});

const linkRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/folders/link",
	tags: ["settings"],
	operationId: "linkSkillFolder",
	description: "Add another agent's skill folder to the skills setting, so pi loads it where it is",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: skillFolderInputSchema } } },
	},
	responses: {
		204: { description: "The folder is in the skills setting, and live engines reloaded" },
		400: { description: "The folder could not be linked", content: errorContent },
	},
});

const unlinkRoute = createRoute({
	method: "post",
	path: "/api/settings/skills/folders/unlink",
	tags: ["settings"],
	operationId: "unlinkSkillFolder",
	description: "Remove another agent's skill folder from the skills setting",
	request: {
		query: settingsScopeQuerySchema,
		body: { required: true, content: { "application/json": { schema: skillFolderInputSchema } } },
	},
	responses: {
		204: { description: "The folder is out of the skills setting, and live engines reloaded" },
		400: { description: "The folder could not be unlinked", content: errorContent },
	},
});

/** The global skills folders a linked skill folder may point into. */
const linkRootsOf = (home: AgentHome): string[] =>
	home.userAgentsSkillsDir === undefined
		? [home.skillsDir]
		: [home.skillsDir, home.userAgentsSkillsDir];

export const skillsRoutes = ({ home, userHome, engines }: Deps) => {
	/** The settings folder and the project it names (null for the home alone). */
	const scopeOf = async (project: string | undefined) => {
		const folder = await settingsFolder(home, project);
		return { folder, project: project === undefined ? null : folder };
	};
	// The generated OpenAPI document keeps registration order.
	return new OpenAPIHono()
		.openapi(readSkillRoute, async (c) => {
			const { root, name } = c.req.valid("param");
			try {
				const dir = await skillRootDir(home, c.req.valid("query").project, root);
				const skill = await readSkillFile(dir, root, name);
				if (skill === undefined) return failure(c, new Error("No such skill"), 404);
				return c.json(skill, 200);
			} catch (error) {
				return failure(c, toError(error, "The skill did not load"), 400);
			}
		})
		.openapi(readListedRoute, async (c) => {
			const { project, filePath } = c.req.valid("query");
			try {
				const scope = await scopeOf(project);
				const listed = (await listSkills(scope.folder, home, scope.project)).find(
					(entry) => entry.filePath === filePath,
				);
				if (listed === undefined) return failure(c, new Error("No such skill"), 404);
				const skill = await readSkillDocument(listed.filePath, listed.name);
				if (skill === undefined) return failure(c, new Error("No such skill"), 404);
				return c.json(skill, 200);
			} catch (error) {
				return failure(c, toError(error, "The skill did not load"), 400);
			}
		})
		.openapi(listedFilesRoute, async (c) => {
			const { project, filePath } = c.req.valid("query");
			try {
				const scope = await scopeOf(project);
				const listed = (await listSkills(scope.folder, home, scope.project)).find(
					(entry) => entry.filePath === filePath,
				);
				if (listed === undefined) return failure(c, new Error("No such skill"), 404);
				return c.json(await listListedSkillFiles(listed.filePath), 200);
			} catch (error) {
				return failure(c, toError(error, "The files did not load"), 400);
			}
		})
		.openapi(listedFileRoute, async (c) => {
			const { project, filePath, path } = c.req.valid("query");
			try {
				const scope = await scopeOf(project);
				const listed = (await listSkills(scope.folder, home, scope.project)).find(
					(entry) => entry.filePath === filePath,
				);
				if (listed === undefined) return failure(c, new Error("No such skill"), 404);
				return c.json({ path, text: await readListedSkillFile(listed.filePath, path) }, 200);
			} catch (error) {
				return failure(c, toError(error, "The file did not load"), 400);
			}
		})
		.openapi(readRawRoute, async (c) => {
			const { root, name } = c.req.valid("param");
			try {
				const dir = await skillRootDir(home, c.req.valid("query").project, root);
				return c.json(
					{ path: "SKILL.md", text: await readRawSkill(dir, name, linkRootsOf(home)) },
					200,
				);
			} catch (error) {
				return failure(c, toError(error, "SKILL.md did not load"), 400);
			}
		})
		.openapi(writeRawRoute, (c) => {
			const { root, name } = c.req.valid("param");
			return configWrite(c, engines, async () =>
				writeRawSkill(
					await skillRootDir(home, c.req.valid("query").project, root),
					name,
					c.req.valid("json").text,
					linkRootsOf(home),
				),
			);
		})
		.openapi(writeSkillRoute, (c) => {
			const { root, name } = c.req.valid("param");
			return configWrite(c, engines, async () =>
				writeSkill(
					await skillRootDir(home, c.req.valid("query").project, root),
					name,
					c.req.valid("json"),
				),
			);
		})
		.openapi(deleteSkillRoute, (c) => {
			const { root, name } = c.req.valid("param");
			return configWrite(c, engines, async () =>
				removeSkill(await skillRootDir(home, c.req.valid("query").project, root), name),
			);
		})
		.openapi(listFilesRoute, async (c) => {
			const { root, name } = c.req.valid("param");
			try {
				const dir = await skillRootDir(home, c.req.valid("query").project, root);
				return c.json(await listSkillFiles(dir, name, linkRootsOf(home)), 200);
			} catch (error) {
				return failure(c, toError(error, "The files did not load"), 400);
			}
		})
		.openapi(readFileRoute, async (c) => {
			const { root, name } = c.req.valid("param");
			const { project, path } = c.req.valid("query");
			try {
				const dir = await skillRootDir(home, project, root);
				return c.json(
					{ path, text: await readSkillBundleFile(dir, name, path, linkRootsOf(home)) },
					200,
				);
			} catch (error) {
				return failure(c, toError(error, "The file did not load"), 400);
			}
		})
		.openapi(writeFileRoute, (c) => {
			const { root, name } = c.req.valid("param");
			const { project, path } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				writeSkillBundleFile(
					await skillRootDir(home, project, root),
					name,
					path,
					c.req.valid("json").text,
					linkRootsOf(home),
				),
			);
		})
		.openapi(deleteFileRoute, (c) => {
			const { root, name } = c.req.valid("param");
			const { project, path } = c.req.valid("query");
			return configWrite(c, engines, async () =>
				deleteSkillBundleFile(
					await skillRootDir(home, project, root),
					name,
					path,
					linkRootsOf(home),
				),
			);
		})
		.openapi(enabledRoute, (c) =>
			configWrite(c, engines, async () => {
				const { filePath, enabled } = c.req.valid("json");
				const scope = await scopeOf(c.req.valid("query").project);
				await setSkillEnabled(scope.folder, home, scope.project, filePath, enabled);
			}),
		)
		.openapi(linkRoute, (c) =>
			configWrite(c, engines, async () => {
				const scope = await scopeOf(c.req.valid("query").project);
				await linkSkillFolder(
					scope.folder,
					home,
					userHome,
					scope.project,
					c.req.valid("json").folder,
				);
			}),
		)
		.openapi(unlinkRoute, (c) =>
			configWrite(c, engines, async () => {
				const scope = await scopeOf(c.req.valid("query").project);
				await unlinkSkillFolder(
					scope.folder,
					home,
					userHome,
					scope.project,
					c.req.valid("json").folder,
				);
			}),
		);
};
