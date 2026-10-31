/**
 * The registry way into the add dialog, apart from its drawing: the name a
 * registry server gets, and the entry once the person's values replace its
 * `{key}` placeholders. The server already shaped the entry as the write route
 * takes it; nothing here guesses a command.
 */
import { mcpNameSchema } from "shared";
import type { ImportedServer } from "shared";

import type { McpRegistryInput, McpRegistryOption, McpRegistrySource } from "@/api/types";

/** What the registry tab holds across its two steps. */
export type RegistryDraft = {
	source: McpRegistrySource;
	query: string;
	/** The server picked from the list; its detail is read for the options. */
	picked: { source: McpRegistrySource; name: string } | undefined;
	/** The option chosen by hand; undefined means the only supported one. */
	optionId: string | undefined;
	/** The name typed in step 2; undefined means the one derived from the registry name. */
	name: string | undefined;
	/** Typed values by input key; an untouched input holds its default. */
	values: Readonly<Record<string, string>>;
};

export const emptyRegistry: RegistryDraft = {
	source: "official",
	query: "",
	picked: undefined,
	optionId: undefined,
	name: undefined,
	values: {},
};

/** The last segment of a registry name, cut down to what an MCP name allows. */
export function defaultNameOf(registryName: string): string {
	const last = registryName.split("/").pop() ?? registryName;
	const cleaned = last.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	return mcpNameSchema.safeParse(cleaned).success ? cleaned : "server";
}

/** The option the person means: the one chosen, else the only supported one. */
export function chosenOption(
	options: readonly McpRegistryOption[],
	optionId: string | undefined,
): McpRegistryOption | undefined {
	const chosen = options.find((option) => option.id === optionId);
	if (chosen !== undefined) return chosen;
	const supported = options.filter((option) => option.supported);
	return supported.length === 1 ? supported[0] : undefined;
}

/** What an input holds: what was typed, else its default, else nothing. */
export const valueOf = (
	input: McpRegistryInput,
	values: Readonly<Record<string, string>>,
): string => values[input.key] ?? input.default ?? "";

/** The required inputs still empty. */
export const missingInputs = (
	option: McpRegistryOption,
	values: Readonly<Record<string, string>>,
): McpRegistryInput[] =>
	option.inputs.filter((input) => input.required && valueOf(input, values).trim() === "");

const placeholder = (input: McpRegistryInput) => `{${input.key}}`;

const substitute = (
	text: string,
	inputs: readonly McpRegistryInput[],
	values: Readonly<Record<string, string>>,
): string =>
	inputs.reduce(
		(result, input) => result.split(placeholder(input)).join(valueOf(input, values)),
		text,
	);

/**
 * The server to write: every placeholder replaced. An environment variable or
 * header whose value ends up empty is dropped rather than written blank, and so
 * is an optional argument left empty, with the flag in front of it.
 */
export function serverOf(
	option: McpRegistryOption,
	values: Readonly<Record<string, string>>,
): ImportedServer | undefined {
	const { entry, inputs } = option;
	if (entry === undefined) return undefined;
	const fill = (text: string) => substitute(text, inputs, values);
	const nonEmpty = (map: Readonly<Record<string, string>>) =>
		Object.fromEntries(
			Object.entries(map)
				.map(([key, text]): [string, string] => [key, fill(text)])
				.filter(([, text]) => text !== ""),
		);
	if (entry.transport === "http") {
		return { transport: "http", url: fill(entry.url), headers: nonEmpty(entry.headers) };
	}
	const args: string[] = [];
	for (const arg of entry.args) {
		const text = fill(arg);
		if (text === "" && arg !== "") {
			if (args.at(-1)?.startsWith("-") === true) args.pop();
			continue;
		}
		args.push(text);
	}
	return {
		transport: "stdio",
		command: entry.command,
		args,
		env: nonEmpty(entry.env),
	};
}
