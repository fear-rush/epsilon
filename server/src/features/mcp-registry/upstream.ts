/**
 * The two registries' answers, read leniently: a field a registry adds later is
 * ignored, and a missing optional one is absent. The official shape is the one
 * Epsilon maps; the GitHub shape is converted into it in `domain.ts`.
 */
import { z } from "zod";

const text = z
	.string()
	.nullish()
	.transform((value) => value ?? undefined);

const variableSchema = z.looseObject({
	description: text,
	isRequired: z.boolean().nullish(),
	isSecret: z.boolean().nullish(),
	default: text,
	choices: z.array(z.string()).nullish(),
});

const variablesSchema = z.record(z.string(), variableSchema).nullish();

const valueFields = {
	description: text,
	isRequired: z.boolean().nullish(),
	isSecret: z.boolean().nullish(),
	default: text,
	value: text,
	choices: z.array(z.string()).nullish(),
	variables: variablesSchema,
};

const envVarSchema = z.looseObject({ name: z.string(), ...valueFields });

const argumentSchema = z.looseObject({
	type: z.string(),
	name: text,
	valueHint: text,
	isRepeated: z.boolean().nullish(),
	...valueFields,
});

const headerSchema = z.looseObject({ name: z.string(), ...valueFields });

const packageSchema = z.looseObject({
	registryType: z.string(),
	identifier: z.string(),
	version: text,
	runtimeHint: text,
	transport: z.looseObject({ type: z.string() }).nullish(),
	environmentVariables: z.array(envVarSchema).nullish(),
	packageArguments: z.array(argumentSchema).nullish(),
	runtimeArguments: z.array(argumentSchema).nullish(),
});

const remoteSchema = z.looseObject({
	type: z.string(),
	url: z.string(),
	headers: z.array(headerSchema).nullish(),
	variables: variablesSchema,
});

export const officialServerSchema = z.looseObject({
	name: z.string(),
	description: text,
	title: text,
	version: text,
	repository: z.looseObject({ url: text }).nullish(),
	websiteUrl: text,
	packages: z.array(packageSchema).nullish(),
	remotes: z.array(remoteSchema).nullish(),
});

export type OfficialServer = z.infer<typeof officialServerSchema>;
export type OfficialPackage = z.infer<typeof packageSchema>;
export type OfficialRemote = z.infer<typeof remoteSchema>;
export type OfficialArgument = z.infer<typeof argumentSchema>;
export type OfficialValue = z.infer<typeof envVarSchema>;

export const officialListSchema = z.looseObject({
	servers: z.array(z.looseObject({ server: officialServerSchema })),
	metadata: z.looseObject({ nextCursor: text }).nullish(),
});

export const officialOneSchema = z.looseObject({ server: officialServerSchema });

const githubVariableSchema = z.looseObject({
	description: text,
	is_required: z.boolean().nullish(),
	is_secret: z.boolean().nullish(),
	default: text,
	choices: z.array(z.string()).nullish(),
});

const githubValueFields = {
	description: text,
	is_required: z.boolean().nullish(),
	is_secret: z.boolean().nullish(),
	default: text,
	value: text,
	choices: z.array(z.string()).nullish(),
	variables: z.record(z.string(), githubVariableSchema).nullish(),
};

const githubValueSchema = z.looseObject({ name: text, ...githubValueFields });

const githubArgumentSchema = z.looseObject({
	type: z.string(),
	name: text,
	value_hint: text,
	...githubValueFields,
});

const githubPackageSchema = z.looseObject({
	name: z.string(),
	registry_name: text,
	runtime_hint: text,
	version: text,
	environment_variables: z.array(githubValueSchema).nullish(),
	package_arguments: z.array(githubArgumentSchema).nullish(),
	runtime_arguments: z.array(githubArgumentSchema).nullish(),
});

const githubRemoteSchema = z.looseObject({
	transport_type: z.string(),
	url: z.string(),
	headers: z.array(githubValueSchema).nullish(),
});

export const githubServerSchema = z.looseObject({
	name: z.string(),
	description: text,
	repository: z.looseObject({ url: text }).nullish(),
	version_detail: z.looseObject({ version: text }).nullish(),
	packages: z.array(githubPackageSchema).nullish(),
	remotes: z.array(githubRemoteSchema).nullish(),
});

export type GithubServer = z.infer<typeof githubServerSchema>;

export const githubListSchema = z.looseObject({
	servers: z.array(z.looseObject({ server: githubServerSchema })),
	metadata: z.looseObject({ next_cursor: text }).nullish(),
});

export type GithubValue = z.infer<typeof githubValueSchema>;
export type GithubArgument = z.infer<typeof githubArgumentSchema>;
