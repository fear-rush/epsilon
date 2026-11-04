import { Schema } from "effect";

/**
 * The two registries' answers, read leniently.
 *
 * A field a registry adds later is ignored by `Schema.Struct`, and a missing or null
 * optional field is `undefined`. The official shape is the one Epsilon maps; the GitHub
 * shape is converted into it in `rules.ts`, because GitHub's packages lack variables and
 * arguments that the official entry of the same name carries.
 */

const text = Schema.optional(Schema.NullOr(Schema.String));
const flag = Schema.optional(Schema.NullOr(Schema.Boolean));
const choices = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)));

const Variable = Schema.Struct({
	description: text,
	isRequired: flag,
	isSecret: flag,
	default: text,
	choices,
});

const Variables = Schema.optional(Schema.NullOr(Schema.Record(Schema.String, Variable)));

/** The fields an env variable, a header and an argument share in the official shape. */
const valueFields = {
	description: text,
	isRequired: flag,
	isSecret: flag,
	default: text,
	value: text,
	choices,
	variables: Variables,
} as const;

export const OfficialVariable = Schema.Struct({ name: Schema.String, ...valueFields });

export const OfficialArgument = Schema.Struct({
	type: Schema.String,
	name: text,
	valueHint: text,
	isRepeated: flag,
	...valueFields,
});

const OfficialHeader = Schema.Struct({ name: Schema.String, ...valueFields });

const OfficialPackage = Schema.Struct({
	registryType: Schema.String,
	identifier: Schema.String,
	version: text,
	runtimeHint: text,
	transport: Schema.optional(Schema.NullOr(Schema.Struct({ type: Schema.String }))),
	environmentVariables: Schema.optional(Schema.NullOr(Schema.Array(OfficialVariable))),
	packageArguments: Schema.optional(Schema.NullOr(Schema.Array(OfficialArgument))),
	runtimeArguments: Schema.optional(Schema.NullOr(Schema.Array(OfficialArgument))),
});

const OfficialRemote = Schema.Struct({
	type: Schema.String,
	url: Schema.String,
	headers: Schema.optional(Schema.NullOr(Schema.Array(OfficialHeader))),
	variables: Variables,
});

export const OfficialServer = Schema.Struct({
	name: Schema.String,
	description: text,
	title: text,
	version: text,
	repository: Schema.optional(Schema.NullOr(Schema.Struct({ url: text }))),
	websiteUrl: text,
	packages: Schema.optional(Schema.NullOr(Schema.Array(OfficialPackage))),
	remotes: Schema.optional(Schema.NullOr(Schema.Array(OfficialRemote))),
});
export type OfficialServer = typeof OfficialServer.Type;
export type OfficialPackage = typeof OfficialPackage.Type;
export type OfficialRemote = typeof OfficialRemote.Type;
export type OfficialArgument = typeof OfficialArgument.Type;
export type OfficialVariable = typeof OfficialVariable.Type;
export type OfficialVariableFields = typeof Variable.Type;

export const OfficialList = Schema.Struct({
	servers: Schema.Array(Schema.Struct({ server: OfficialServer })),
	metadata: Schema.optional(Schema.NullOr(Schema.Struct({ nextCursor: text }))),
});
export type OfficialList = typeof OfficialList.Type;

export const OfficialOne = Schema.Struct({ server: OfficialServer });

const GithubVariable = Schema.Struct({
	description: text,
	is_required: flag,
	is_secret: flag,
	default: text,
	choices,
});

const githubValueFields = {
	description: text,
	is_required: flag,
	is_secret: flag,
	default: text,
	value: text,
	choices,
	variables: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, GithubVariable))),
} as const;

const GithubValue = Schema.Struct({ name: text, ...githubValueFields });

const GithubArgument = Schema.Struct({
	type: Schema.String,
	name: text,
	value_hint: text,
	...githubValueFields,
});

const GithubPackage = Schema.Struct({
	name: Schema.String,
	registry_name: text,
	runtime_hint: text,
	version: text,
	environment_variables: Schema.optional(Schema.NullOr(Schema.Array(GithubValue))),
	package_arguments: Schema.optional(Schema.NullOr(Schema.Array(GithubArgument))),
	runtime_arguments: Schema.optional(Schema.NullOr(Schema.Array(GithubArgument))),
});

const GithubRemote = Schema.Struct({
	transport_type: Schema.String,
	url: Schema.String,
	headers: Schema.optional(Schema.NullOr(Schema.Array(GithubValue))),
});

const GithubServer = Schema.Struct({
	name: Schema.String,
	description: text,
	repository: Schema.optional(Schema.NullOr(Schema.Struct({ url: text }))),
	version_detail: Schema.optional(Schema.NullOr(Schema.Struct({ version: text }))),
	packages: Schema.optional(Schema.NullOr(Schema.Array(GithubPackage))),
	remotes: Schema.optional(Schema.NullOr(Schema.Array(GithubRemote))),
});
export type GithubServer = typeof GithubServer.Type;
export type GithubValue = typeof GithubValue.Type;
export type GithubArgument = typeof GithubArgument.Type;

export const GithubList = Schema.Struct({
	servers: Schema.Array(Schema.Struct({ server: GithubServer })),
	metadata: Schema.optional(Schema.NullOr(Schema.Struct({ next_cursor: text }))),
});
export type GithubList = typeof GithubList.Type;
