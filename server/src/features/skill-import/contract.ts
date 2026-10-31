/** The skill-import shapes the routes, the store and the service share. */
import { z } from "@hono/zod-openapi";

const issueSchema = z
	.object({
		code: z.string(),
		message: z.string(),
		path: z.string().optional(),
	})
	.openapi("SkillImportIssue");

const fileSchema = z.object({ path: z.string(), size: z.number() });

const existingSchema = z.object({
	/** A skill of this name is already in the agent home's skills. */
	global: z.boolean(),
	/** A skill of this name is already in the picked project; false when none is picked. */
	project: z.boolean(),
});

const candidateSchema = z
	.object({
		/** The frontmatter name, or the folder name when the file has none. */
		name: z.string(),
		/** The skill folder, relative to the staged source; empty when the source is the skill. */
		dir: z.string(),
		description: z.string(),
		files: z.array(fileSchema),
		/** Files that run: under `scripts/`, with a shebang, or with the execute bit. */
		scripts: z.array(z.string()),
		errors: z.array(issueSchema),
		warnings: z.array(issueSchema),
		/** Paths dropped silently: `.git`, `node_modules`, OS litter. */
		removed: z.array(z.string()),
		/** False when the skill sets `disable-model-invocation`. */
		modelInvocation: z.boolean(),
		existing: existingSchema,
	})
	.openapi("SkillImportCandidate");

export type Candidate = z.infer<typeof candidateSchema>;

const packageOptionSchema = z.object({
	available: z.boolean(),
	/** The source pi would install, when available. */
	source: z.string().optional(),
	/** Why it is or is not available, in a sentence. */
	reason: z.string(),
});

export type PackageOption = z.infer<typeof packageOptionSchema>;

export const importReportSchema = z
	.object({
		stageId: z.string(),
		source: z.string(),
		candidates: z.array(candidateSchema),
		packageOption: packageOptionSchema,
	})
	.openapi("SkillImportReport");

export type ImportReport = z.infer<typeof importReportSchema>;

export const stageParamsSchema = z.object({ stageId: z.uuid() });

/** One folder's files or one archive; a file's name is its path inside the picked folder. */
export const uploadBodySchema = z.object({
	files: z.any().openapi({
		type: "array",
		items: { type: "string", format: "binary" },
		description:
			"Either the files of one picked folder, each named by its path inside that folder, or a single .zip, .tar, .tar.gz or .tgz archive",
	}),
});

export const sourceBodySchema = z
	.object({
		input: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.describe("A skills install command, a GitHub or GitLab URL, a git URL or owner/repo"),
	})
	.openapi("SkillImportSource");

const importTargetSchema = z.enum(["global", "project"]);

export const commitBodySchema = z
	.object({
		/** The names of the candidates to install. */
		skills: z.array(z.string()).min(1),
		/** The agent home's skills, or the picked project's `.agents/skills`. */
		target: importTargetSchema,
		/** Names that may overwrite an existing skill in the target. */
		replace: z.array(z.string()).default([]),
		/** `copy` puts the files in the skills folder; `package` has pi install the repository. */
		mode: z.enum(["copy", "package"]).default("copy"),
	})
	.openapi("SkillImportCommit");

export type CommitBody = z.infer<typeof commitBodySchema>;

/** What is written next to the staged files, so the stage survives a restart. */
export const stageFileSchema = z.object({
	source: z.string(),
	/** The `skills` CLI source, when the stage came from one. */
	cliSource: z.string().optional(),
	createdAt: z.number(),
	/** Paths left out while unpacking, with why. */
	skipped: z.array(z.object({ path: z.string(), reason: z.enum(["stripped", "symlink"]) })),
	packageOption: packageOptionSchema,
});

export type StageFile = z.infer<typeof stageFileSchema>;
