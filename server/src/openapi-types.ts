/**
 * The client's REST types, written from the OpenAPI document as plain text: the
 * `paths` and `components` interfaces openapi-fetch reads. It covers the JSON
 * Schema subset the zod contracts emit and refuses anything else, so a new
 * construct fails the generator instead of becoming a wrong type. It needs no
 * compiler API, so it runs on the repo's own TypeScript.
 */
import { z } from "zod";

type JsonValue = string | number | boolean | null;

type JsonSchema = {
	$ref?: string;
	type?: string | string[];
	description?: string;
	properties?: { [name: string]: JsonSchema };
	required?: string[];
	items?: JsonSchema;
	enum?: JsonValue[];
	const?: JsonValue;
	oneOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	allOf?: JsonSchema[];
	additionalProperties?: boolean | JsonSchema;
};

/** Keywords that only constrain a value; a type ignores them. */
const CONSTRAINTS = [
	"minLength",
	"maxLength",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"pattern",
	"format",
	"default",
	"discriminator",
	"propertyNames",
	"minItems",
	"maxItems",
] as const;

const jsonValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Strict: a keyword this generator does not know fails the parse. */
const jsonSchema: z.ZodType<JsonSchema> = z.lazy(() =>
	z.strictObject({
		$ref: z.string().optional(),
		type: z.union([z.string(), z.array(z.string())]).optional(),
		description: z.string().optional(),
		properties: z.record(z.string(), jsonSchema).optional(),
		required: z.array(z.string()).optional(),
		items: jsonSchema.optional(),
		enum: z.array(jsonValue).optional(),
		const: jsonValue.optional(),
		oneOf: z.array(jsonSchema).optional(),
		anyOf: z.array(jsonSchema).optional(),
		allOf: z.array(jsonSchema).optional(),
		additionalProperties: z.union([z.boolean(), jsonSchema]).optional(),
		...Object.fromEntries(CONSTRAINTS.map((keyword) => [keyword, z.json().optional()])),
	}),
);

const mediaSchema = z.record(z.string(), z.looseObject({ schema: jsonSchema }));

const operationSchema = z.looseObject({
	operationId: z.string(),
	description: z.string().optional(),
	parameters: z
		.array(
			z.looseObject({
				name: z.string(),
				in: z.enum(["path", "query", "header", "cookie"]),
				required: z.boolean().optional(),
				description: z.string().optional(),
				schema: jsonSchema,
			}),
		)
		.optional(),
	requestBody: z.looseObject({ required: z.boolean().optional(), content: mediaSchema }).optional(),
	responses: z.record(
		z.string(),
		z.looseObject({ description: z.string().optional(), content: mediaSchema.optional() }),
	),
});

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

const documentSchema = z.looseObject({
	paths: z.record(z.string(), z.partialRecord(z.enum(METHODS), operationSchema)),
	components: z.looseObject({ schemas: z.record(z.string(), jsonSchema).optional() }).optional(),
});

type Operation = z.infer<typeof operationSchema>;
type Parameter = NonNullable<Operation["parameters"]>[number];

/** A bare key: an identifier, or a status code (openapi-fetch matches numeric keys). */
const IDENTIFIER = /^([A-Za-z_$][A-Za-z0-9_$]*|[1-9][0-9]*)$/;

const key = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

const comment = (text: string | undefined, pad: string): string =>
	text === undefined ? "" : `${pad}/** ${text.replace(/\*\//g, "*\\/").replace(/\s+/g, " ")} */\n`;

const refName = (ref: string): string => {
	const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
	if (match?.[1] === undefined) throw new Error(`Unsupported $ref: ${ref}`);
	return `components["schemas"][${JSON.stringify(match[1])}]`;
};

/** A literal, a keyword or a component reference needs no parentheses in a union. */
const SIMPLE = /^(?:[A-Za-z_$][\w$]*|"[^"]*"|-?\d+(?:\.\d+)?|components\["schemas"\]\["[^"]+"\])$/;

const group = (part: string): string => (SIMPLE.test(part) ? part : `(${part})`);

const union = (parts: string[]): string => {
	const unique = [...new Set(parts)];
	return unique.length === 1 ? (unique[0] ?? "never") : unique.map(group).join(" | ");
};

/**
 * Declared properties, then any others as an intersected index signature, as
 * openapi-typescript writes it: the declared types stay exact instead of having
 * to fit the index signature's value type.
 */
const objectType = (schema: JsonSchema, depth: number): string => {
	const pad = "\t".repeat(depth + 1);
	const close = "\t".repeat(depth);
	const required = new Set(schema.required ?? []);
	const lines = Object.entries(schema.properties ?? {}).map(
		([name, property]) =>
			`${comment(property.description, pad)}${pad}${key(name)}${required.has(name) ? "" : "?"}: ${render(property, depth + 1)};`,
	);
	const extra = schema.additionalProperties;
	// No keyword means no index signature, unless the object declares nothing at all.
	const value =
		extra === true || (extra === undefined && lines.length === 0)
			? "unknown"
			: extra === undefined || extra === false
				? undefined
				: render(extra, depth + 1);
	const declared = `{\n${lines.join("\n")}\n${close}}`;
	const others = value === undefined ? undefined : `{\n${pad}[key: string]: ${value};\n${close}}`;
	if (lines.length === 0) return others ?? "Record<string, never>";
	return others === undefined ? declared : `${declared} & ${others}`;
};

const renderType = (type: string, schema: JsonSchema, depth: number): string => {
	switch (type) {
		case "string":
		case "boolean":
		case "null":
			return type;
		case "number":
		case "integer":
			return "number";
		case "array":
			return schema.items === undefined ? "unknown[]" : `${group(render(schema.items, depth))}[]`;
		case "object":
			return objectType(schema, depth);
		default:
			throw new Error(`Unsupported JSON Schema type: ${type}`);
	}
};

/** One schema as a TypeScript type, indented for `depth`. */
const render = (schema: JsonSchema, depth: number): string => {
	if (schema.$ref !== undefined) return refName(schema.$ref);
	if (schema.const !== undefined) return JSON.stringify(schema.const);
	if (schema.enum !== undefined) return union(schema.enum.map((value) => JSON.stringify(value)));
	const members = schema.oneOf ?? schema.anyOf;
	if (members !== undefined) return union(members.map((member) => render(member, depth)));
	if (schema.allOf !== undefined) {
		return schema.allOf.map((member) => group(render(member, depth))).join(" & ");
	}
	const types = Array.isArray(schema.type)
		? schema.type
		: schema.type === undefined
			? []
			: [schema.type];
	if (types.length > 0) return union(types.map((type) => renderType(type, schema, depth)));
	if (schema.properties !== undefined || schema.additionalProperties !== undefined) {
		return objectType(schema, depth);
	}
	return "unknown";
};

const NO_PARAMETERS =
	"{\n\t\t\tquery?: never;\n\t\t\theader?: never;\n\t\t\tpath?: never;\n\t\t\tcookie?: never;\n\t\t}";

const parameterGroups = (parameters: Parameter[]): string => {
	const groups = (["query", "header", "path", "cookie"] as const).map((place) => {
		const own = parameters.filter((parameter) => parameter.in === place);
		if (own.length === 0) return `\t\t\t${place}?: never;`;
		const optional = own.every((parameter) => parameter.required !== true);
		const fields = own.map(
			(parameter) =>
				`${comment(parameter.description, "\t\t\t\t")}\t\t\t\t${key(parameter.name)}${parameter.required === true ? "" : "?"}: ${render(parameter.schema, 4)};`,
		);
		return `\t\t\t${place}${optional ? "?" : ""}: {\n${fields.join("\n")}\n\t\t\t};`;
	});
	return `{\n${groups.join("\n")}\n\t\t}`;
};

const content = (media: z.infer<typeof mediaSchema>, depth: number): string => {
	const pad = "\t".repeat(depth + 1);
	const entries = Object.entries(media).map(
		([type, { schema }]) => `${pad}${JSON.stringify(type)}: ${render(schema, depth + 1)};`,
	);
	return `{\n${entries.join("\n")}\n${"\t".repeat(depth)}}`;
};

const operationType = (operation: Operation): string => {
	const body = operation.requestBody;
	const requestBody =
		body === undefined
			? "\t\trequestBody?: never;"
			: `\t\trequestBody${body.required === true ? "" : "?"}: {\n\t\t\tcontent: ${content(body.content, 3)};\n\t\t};`;
	const responses = Object.entries(operation.responses).map(([status, response]) => {
		const answer =
			response.content === undefined
				? "content?: never;"
				: `content: ${content(response.content, 4)};`;
		return `${comment(response.description, "\t\t\t")}\t\t\t${key(status)}: {\n\t\t\t\theaders: {\n\t\t\t\t\t[name: string]: unknown;\n\t\t\t\t};\n\t\t\t\t${answer}\n\t\t\t};`;
	});
	return [
		"{",
		`\t\tparameters: ${parameterGroups(operation.parameters ?? [])};`,
		requestBody,
		`\t\tresponses: {\n${responses.join("\n")}\n\t\t};`,
		"\t}",
	].join("\n");
};

/** The whole `schema.gen.ts` for one OpenAPI document, given as its JSON text. */
export const renderApiTypes = (documentJson: string): string => {
	const document = documentSchema.parse(JSON.parse(documentJson));
	const paths: string[] = [];
	const operations: string[] = [];
	for (const [path, item] of Object.entries(document.paths)) {
		const methods = METHODS.map((method) => {
			const operation = item[method];
			if (operation === undefined) return `\t\t${method}?: never;`;
			operations.push(
				`${comment(operation.description, "\t")}\t${key(operation.operationId)}: ${operationType(operation)};`,
			);
			return `${comment(operation.description, "\t\t")}\t\t${method}: operations[${JSON.stringify(operation.operationId)}];`;
		});
		paths.push(
			`\t${JSON.stringify(path)}: {\n\t\tparameters: ${NO_PARAMETERS};\n${methods.join("\n")}\n\t};`,
		);
	}
	const schemas = Object.entries(document.components?.schemas ?? {}).map(
		([name, schema]) =>
			`${comment(schema.description, "\t\t")}\t\t${key(name)}: ${render(schema, 2)};`,
	);
	return [
		"/** Generated from openapi.json by `bun run api:generate`. Do not edit. */",
		"",
		`export interface paths {\n${paths.join("\n")}\n}`,
		"",
		`export interface components {\n\tschemas: {\n${schemas.join("\n")}\n\t};\n}`,
		"",
		`interface operations {\n${operations.join("\n")}\n}`,
		"",
	].join("\n");
};
