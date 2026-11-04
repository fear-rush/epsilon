import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ImportFailed, StageGone } from "../errors.ts";

/**
 * Settings → Skills → Import: one pipeline for a pasted source, a picked folder or an
 * archive. The server stages the files, checks every skill strictly and reports what it
 * found; a commit moves only the chosen skills into a skills root.
 *
 * A stage is a folder under the agent home, so a report can be read again and a commit
 * checks the same files the person approved. The report is rebuilt from disk each time.
 */

export const SkillImportIssue = Schema.Struct({
	/** A stable tag the panel can switch on. */
	code: Schema.String,
	/** One sentence for the person importing. */
	message: Schema.String,
	/** The file the issue is about, relative to the skill folder. */
	path: Schema.optional(Schema.String),
});
export type SkillImportIssue = typeof SkillImportIssue.Type;

const ImportFile = Schema.Struct({ path: Schema.String, size: Schema.Finite });

const ExistingSkill = Schema.Struct({
	/** A skill of this name is already in the agent home's skills. */
	global: Schema.Boolean,
	/** A skill of this name is already in the picked project; false when none is picked. */
	project: Schema.Boolean,
});

export const SkillImportCandidate = Schema.Struct({
	/** The frontmatter name, or the folder name when the file has none. */
	name: Schema.String,
	/** The skill folder, relative to the staged source; empty when the source is the skill. */
	dir: Schema.String,
	description: Schema.String,
	files: Schema.Array(ImportFile),
	/** Files that run: under `scripts/`, with a shebang, or with the execute bit. */
	scripts: Schema.Array(Schema.String),
	errors: Schema.Array(SkillImportIssue),
	warnings: Schema.Array(SkillImportIssue),
	/** Paths dropped silently: `.git`, `node_modules`, OS litter. */
	removed: Schema.Array(Schema.String),
	/** False when the skill sets `disable-model-invocation`. */
	modelInvocation: Schema.Boolean,
	existing: ExistingSkill,
});
export type SkillImportCandidate = typeof SkillImportCandidate.Type;

export const SkillImportPackageOption = Schema.Struct({
	available: Schema.Boolean,
	/** The source pi would install, when available. */
	source: Schema.optional(Schema.String),
	/** Why it is or is not available, in a sentence. */
	reason: Schema.String,
});
export type SkillImportPackageOption = typeof SkillImportPackageOption.Type;

export const SkillImportReport = Schema.Struct({
	stageId: Schema.String,
	source: Schema.String,
	candidates: Schema.Array(SkillImportCandidate),
	packageOption: SkillImportPackageOption,
});
export type SkillImportReport = typeof SkillImportReport.Type;

/** A stage id is a UUID: it becomes a folder name under the agent home. */
export const SkillImportStageId = Schema.String.pipe(Schema.check(Schema.isUUID(4)));
export type SkillImportStageId = typeof SkillImportStageId.Type;

/** One uploaded file; a picked folder names each by its path inside that folder. */
export const SkillImportUploadFile = Schema.Struct({
	name: Schema.String,
	bytes: Schema.Uint8Array,
});
export type SkillImportUploadFile = typeof SkillImportUploadFile.Type;

export const SkillImportCommit = Schema.Struct({
	/** The names of the candidates to install. */
	skills: Schema.Array(Schema.NonEmptyString),
	/** The agent home's skills, or the picked project's `.agents/skills`. */
	target: Schema.Literals(["global", "project"]),
	/** Names that may overwrite an existing skill in the target. */
	replace: Schema.Array(Schema.String),
	/** `copy` puts the files in the skills folder; `package` lets pi install the repository. */
	mode: Schema.Literals(["copy", "package"]),
});
export type SkillImportCommit = typeof SkillImportCommit.Type;

export const SkillImportRpcs = RpcGroup.make(
	Rpc.make("config.skills.import.stageSource", {
		payload: { folder: Schema.NullOr(Schema.String), input: Schema.NonEmptyString },
		success: SkillImportReport,
		error: ImportFailed,
	}),
	Rpc.make("config.skills.import.stageUpload", {
		payload: {
			folder: Schema.NullOr(Schema.String),
			files: Schema.Array(SkillImportUploadFile),
		},
		success: SkillImportReport,
		error: ImportFailed,
	}),
	Rpc.make("config.skills.import.report", {
		payload: { folder: Schema.NullOr(Schema.String), stageId: SkillImportStageId },
		success: SkillImportReport,
		error: Schema.Union([ImportFailed, StageGone]),
	}),
	Rpc.make("config.skills.import.commit", {
		payload: {
			folder: Schema.NullOr(Schema.String),
			stageId: SkillImportStageId,
			commit: SkillImportCommit,
		},
		success: Schema.Void,
		error: Schema.Union([ImportFailed, StageGone]),
	}),
	Rpc.make("config.skills.import.discard", {
		payload: { folder: Schema.NullOr(Schema.String), stageId: SkillImportStageId },
		success: Schema.Void,
	}),
);
