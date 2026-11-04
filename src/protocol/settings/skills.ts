import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SkillRefused } from "../errors.ts";

/**
 * Settings → Skills: what pi loads for a folder, one `SKILL.md` for the editor, and the
 * switches that write a `-<path>` into pi's `skills` setting.
 *
 * A skill is a directory with a `SKILL.md`. Epsilon writes plain files, not a pi format:
 * a save goes through the file's YAML document, so keys the panel does not manage and
 * their comments survive. A file whose frontmatter does not parse is read as raw text and
 * never rewritten.
 */

/** The folders the dashboard edits. */
export const SkillRoot = Schema.Literals(["home", "user-agents", "project-pi", "project-agents"]);
export type SkillRoot = typeof SkillRoot.Type;

/** Where pi found a skill. The origins named like a `SkillRoot` are editable. */
export const SkillOrigin = Schema.Literals([
	"home",
	"user-agents",
	"project-pi",
	"project-agents",
	"settings-path",
	"package",
	"extension",
]);
export type SkillOrigin = typeof SkillOrigin.Type;

export const SkillStatus = Schema.Literals([
	"active",
	"manual",
	"disabled",
	"shadowed",
	"invalid",
	"untrusted",
]);
export type SkillStatus = typeof SkillStatus.Type;

/** How one skill can be turned off: a `-path` in `skills`, in Packages, or not at all. */
export const SkillToggle = Schema.Literals(["settings", "package", "none"]);
export type SkillToggle = typeof SkillToggle.Type;

export const SkillView = Schema.Struct({
	/** pi's name for the skill: its frontmatter `name`, else the folder name. */
	name: Schema.String,
	/** The folder that holds it, which is how an editable skill's routes address it. */
	folder: Schema.String,
	description: Schema.String,
	filePath: Schema.String,
	dir: Schema.String,
	origin: SkillOrigin,
	/** The package source, when the skill comes from a package. */
	packageSource: Schema.optional(Schema.String),
	/** Which settings file holds the skill's switch. */
	scope: Schema.Literals(["user", "project"]),
	editable: Schema.Boolean,
	/** The root to open it with when `editable`. */
	root: Schema.optional(SkillRoot),
	/** True when the model may load the skill on its own. */
	modelInvocation: Schema.Boolean,
	status: SkillStatus,
	/** The `SKILL.md` that won the name, when `status` is `shadowed`. */
	shadowedBy: Schema.optional(Schema.String),
	/** Why pi refused the skill, when `status` is `invalid`. */
	message: Schema.optional(Schema.String),
	toggle: SkillToggle,
	warnings: Schema.Array(Schema.String),
});
export type SkillView = typeof SkillView.Type;

export const SkillListView = Schema.Struct({ skills: Schema.Array(SkillView) });
export type SkillListView = typeof SkillListView.Type;

/** A frontmatter key the panel does not manage, shown read-only and kept on every save. */
export const SkillField = Schema.Struct({
	key: Schema.String,
	owner: Schema.Literals(["pi", "spec", "claude-code", "unknown"]),
	/** The value as YAML text. */
	value: Schema.String,
});
export type SkillField = typeof SkillField.Type;

/**
 * What a save sets. `name` and the root come from the payload. For `license`,
 * `compatibility` and `metadata`, an omitted field leaves the file as it is and an empty
 * one removes the key.
 */
export const SkillInput = Schema.Struct({
	description: Schema.String,
	body: Schema.String,
	/** False writes `disable-model-invocation: true`; true removes the key. */
	modelInvocation: Schema.Boolean,
	license: Schema.optional(Schema.String),
	compatibility: Schema.optional(Schema.String),
	metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type SkillInput = typeof SkillInput.Type;

/** One skill file, for the edit form. */
export const SkillFile = Schema.Struct({
	root: SkillRoot,
	name: Schema.String,
	filePath: Schema.String,
	description: Schema.String,
	body: Schema.String,
	modelInvocation: Schema.Boolean,
	license: Schema.optional(Schema.String),
	compatibility: Schema.optional(Schema.String),
	/** Present when `metadata` is a plain string map; otherwise it is in `fields`. */
	metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	fields: Schema.Array(SkillField),
	/** Body syntax another agent expands and pi passes through as text. */
	bodyWarnings: Schema.Array(Schema.String),
	/** Set when the frontmatter does not parse; then only `raw` is meaningful. */
	parseError: Schema.optional(Schema.String),
	raw: Schema.optional(Schema.String),
});
export type SkillFile = typeof SkillFile.Type;

/** A listed skill's file read for display, wherever it lives: the same shape without a root. */
export const SkillDocument = Schema.Struct({
	name: Schema.String,
	filePath: Schema.String,
	description: Schema.String,
	body: Schema.String,
	modelInvocation: Schema.Boolean,
	license: Schema.optional(Schema.String),
	compatibility: Schema.optional(Schema.String),
	metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	fields: Schema.Array(SkillField),
	bodyWarnings: Schema.Array(Schema.String),
	parseError: Schema.optional(Schema.String),
	raw: Schema.optional(Schema.String),
});
export type SkillDocument = typeof SkillDocument.Type;

/** What one engine answers to the `extensionSkills` query. */
export const SkillEngineLive = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	filePath: Schema.String,
	baseDir: Schema.String,
	disableModelInvocation: Schema.Boolean,
});
export type SkillEngineLive = typeof SkillEngineLive.Type;

export const ExtensionSkillsAnswer = Schema.Struct({ skills: Schema.Array(SkillEngineLive) });
export type ExtensionSkillsAnswer = typeof ExtensionSkillsAnswer.Type;

/** The folder a read or write names; null is the home alone. */
const folder = { folder: Schema.NullOr(Schema.String) } as const;

/** The root and folder name an editable skill is addressed by. */
const skillTarget = {
	...folder,
	root: SkillRoot,
	name: Schema.NonEmptyString,
} as const;

export const SkillRpcs = RpcGroup.make(
	Rpc.make("settings.skills.list", {
		payload: folder,
		success: SkillListView,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.read", {
		payload: skillTarget,
		success: SkillFile,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.save", {
		payload: { ...skillTarget, input: SkillInput },
		success: Schema.Void,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.remove", {
		payload: skillTarget,
		success: Schema.Void,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.setEnabled", {
		payload: { ...folder, filePath: Schema.NonEmptyString, enabled: Schema.Boolean },
		success: Schema.Void,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.readRaw", {
		payload: skillTarget,
		success: Schema.Struct({ text: Schema.String }),
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.writeRaw", {
		payload: { ...skillTarget, text: Schema.String },
		success: Schema.Void,
		error: SkillRefused,
	}),
	Rpc.make("settings.skills.readDocument", {
		payload: { ...folder, filePath: Schema.NonEmptyString },
		success: SkillDocument,
		error: SkillRefused,
	}),
);
