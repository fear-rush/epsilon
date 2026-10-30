/**
 * The form rules for one MCP server. The shared schema stays the contract; this
 * adds what only the form knows: a name that is free in its own file, a command
 * or URL that is there, an absolute URL, map rows that are complete, and a
 * timeout in seconds. Only the fields that fail come back, so the caller can put
 * each message under its own control.
 */
import { z } from "zod";
import { mcpNameSchema } from "shared";

import type { PairRow } from "@/components/settings/pair-rows";
import type { McpDraft } from "./mcp-draft";

export type McpField = "name" | "command" | "env" | "url" | "headers" | "timeout";

export const mcpFields: readonly McpField[] = [
	"name",
	"command",
	"env",
	"url",
	"headers",
	"timeout",
];

export type McpFieldErrors = Partial<Record<McpField, string>>;

const nameProblem = (draft: McpDraft, takenNames: ReadonlySet<string>): string | undefined => {
	const name = draft.name.trim();
	if (name === "") return "An MCP server needs a name.";
	const parsed = mcpNameSchema.safeParse(name);
	if (!parsed.success) {
		return parsed.error.issues[0]?.message ?? "Use letters, digits, dashes and underscores.";
	}
	if (takenNames.has(name)) {
		return `This file already defines a server named ${name}. Pick another name.`;
	}
	return undefined;
};

const rowsProblem = (rows: PairRow[]): string | undefined =>
	rows.some((row) => row.key.trim() === "" || (!row.stored && row.value.trim() === ""))
		? "Fill the name and value, or remove the row."
		: undefined;

const timeoutProblem = (value: string): string | undefined => {
	const text = value.trim();
	if (text === "") return undefined;
	const seconds = Number(text);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "Enter a positive number of seconds, or leave it blank for 60.";
	}
	return undefined;
};

export function mcpFieldErrors(draft: McpDraft, takenNames: ReadonlySet<string>): McpFieldErrors {
	const errors: McpFieldErrors = {};
	const name = nameProblem(draft, takenNames);
	if (name !== undefined) errors.name = name;

	if (draft.transport === "stdio") {
		if (draft.command.trim() === "") errors.command = "A stdio server needs a command.";
		const env = rowsProblem(draft.env);
		if (env !== undefined) errors.env = env;
	} else {
		const url = draft.url.trim();
		if (url === "") errors.url = "An HTTP server needs a URL.";
		else if (!z.url().safeParse(url).success) errors.url = "Enter an absolute URL.";
		const headers = rowsProblem(draft.headers);
		if (headers !== undefined) errors.headers = headers;
	}

	const timeout = timeoutProblem(draft.timeout);
	if (timeout !== undefined) errors.timeout = timeout;

	return errors;
}
