/** The skill shapes the routes, the store and the inventory share. */
import { skillDescriptionSchema } from "shared";
import { z } from "@hono/zod-openapi";

/**
 * The folders the dashboard edits: the agent home's `skills`, the `~/.agents/skills`
 * of the `~` in effect (the sandbox's under `bun run dev`, the real one on a host),
 * and a trusted project's `.pi/skills` and `.agents/skills`.
 */
export const skillRootSchema = z
	.enum(["home", "user-agents", "project-pi", "project-agents"])
	.openapi("SkillRoot");

export type SkillRoot = z.infer<typeof skillRootSchema>;

/** Where pi found a skill. The origins named like a `SkillRoot` are editable. */
const skillOriginSchema = z
	.enum([
		"home",
		"user-agents",
		"project-pi",
		"project-agents",
		"settings-path",
		"package",
		"extension",
	])
	.openapi("SkillOrigin");

export type SkillOrigin = z.infer<typeof skillOriginSchema>;

const skillStatusSchema = z
	.enum(["active", "manual", "disabled", "shadowed", "invalid", "untrusted"])
	.openapi("SkillStatus");

/** How one skill can be turned off: a `-path` in `settings.json`, in Packages, or not at all. */
const skillToggleSchema = z.enum(["settings", "package", "none"]).openapi("SkillToggle");

export const skillViewSchema = z
	.object({
		name: z.string(),
		description: z.string(),
		filePath: z.string(),
		dir: z.string(),
		origin: skillOriginSchema,
		/** The package source, when the skill comes from a package. */
		packageSource: z.string().optional(),
		/** Which settings file holds the skill's switch. */
		scope: z.enum(["user", "project"]),
		editable: z.boolean(),
		/** The root to open it with when `editable`. */
		root: skillRootSchema.optional(),
		/** True when the model may load the skill on its own. */
		modelInvocation: z.boolean(),
		status: skillStatusSchema,
		/** The `SKILL.md` that won the name, when `status` is `shadowed`. */
		shadowedBy: z.string().optional(),
		/** Why pi refused the skill, when `status` is `invalid`. */
		message: z.string().optional(),
		toggle: skillToggleSchema,
		warnings: z.array(z.string()),
	})
	.openapi("SkillView");

export type SkillView = z.infer<typeof skillViewSchema>;

/** A skill folder another coding agent owns. */
const foreignAgentSchema = z.enum(["claude-code", "codex"]).openapi("ForeignAgent");

export type ForeignAgent = z.infer<typeof foreignAgentSchema>;

export const foreignSkillViewSchema = z
	.object({
		agent: foreignAgentSchema,
		scope: z.enum(["user", "project"]),
		/** The folder that holds the skill, the unit that links and unlinks. */
		folder: z.string(),
		/** The folder is in the `skills` setting, so pi loads it. */
		linked: z.boolean(),
		name: z.string(),
		description: z.string(),
		filePath: z.string(),
		warnings: z.array(z.string()),
	})
	.openapi("ForeignSkillView");

export type ForeignSkillView = z.infer<typeof foreignSkillViewSchema>;

/** A frontmatter key the panel does not manage, shown read-only and kept on every save. */
const skillFieldSchema = z
	.object({
		key: z.string(),
		owner: z.enum(["pi", "spec", "claude-code", "unknown"]),
		/** The value as YAML text. */
		value: z.string(),
	})
	.openapi("SkillField");

export type SkillField = z.infer<typeof skillFieldSchema>;

/**
 * What a save sets. `name` and the root come from the URL. For `license`,
 * `compatibility` and `metadata`, an omitted field leaves the file as it is and an
 * empty one removes the key.
 */
export const skillInputSchema = z
	.object({
		description: skillDescriptionSchema,
		body: z.string(),
		/** False writes `disable-model-invocation: true`; true removes the key. */
		modelInvocation: z.boolean(),
		license: z.string().max(500).optional(),
		compatibility: z.string().max(500).optional(),
		metadata: z.record(z.string(), z.string()).optional(),
	})
	.openapi("SkillInput");

export type SkillInput = z.infer<typeof skillInputSchema>;

/** One skill file, for the edit form. */
export const skillFileSchema = z
	.object({
		root: skillRootSchema,
		name: z.string(),
		filePath: z.string(),
		description: z.string(),
		body: z.string(),
		modelInvocation: z.boolean(),
		license: z.string().optional(),
		compatibility: z.string().optional(),
		/** Present when `metadata` is a plain string map; otherwise it is in `fields`. */
		metadata: z.record(z.string(), z.string()).optional(),
		fields: z.array(skillFieldSchema),
		/** Body syntax another agent expands and pi passes through as text. */
		bodyWarnings: z.array(z.string()),
		/** Set when the frontmatter does not parse. Then only `raw` is meaningful, and saves are refused. */
		parseError: z.string().optional(),
		raw: z.string().optional(),
	})
	.openapi("SkillFile");

export type SkillFile = z.infer<typeof skillFileSchema>;

/** A listed skill's file read for display, wherever it lives: the same shape without an editable root. */
export const skillDocumentSchema = skillFileSchema.omit({ root: true }).openapi("SkillDocument");

export type SkillDocument = z.infer<typeof skillDocumentSchema>;

export const skillEnabledInputSchema = z
	.object({ filePath: z.string().min(1), enabled: z.boolean() })
	.openapi("SkillEnabledInput");

export const skillFolderInputSchema = z
	.object({ folder: z.string().min(1) })
	.openapi("SkillFolderInput");

/** One file inside a skill folder, as the file list shows it. */
const skillBundleEntrySchema = z
	.object({
		/** POSIX path relative to the skill folder. */
		path: z.string(),
		size: z.number().int(),
		/** True when the editor can open it: UTF-8 with no NUL byte near the start. */
		text: z.boolean(),
	})
	.openapi("SkillBundleEntry");

export const skillBundleListSchema = z
	.object({
		files: z.array(skillBundleEntrySchema),
		/** Symlinks and files past the file limit, which are not listed. */
		skipped: z.number().int(),
	})
	.openapi("SkillBundleList");

export const skillBundleFileSchema = z
	.object({ path: z.string(), text: z.string() })
	.openapi("SkillBundleFile");

export const skillBundleFileInputSchema = z
	.object({ text: z.string() })
	.openapi("SkillBundleFileInput");
