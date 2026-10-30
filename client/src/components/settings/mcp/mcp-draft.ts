/**
 * The editable state of one MCP server, and the conversions around it. The
 * transport decides which target the write carries; the other target stays in
 * the draft so switching back does not lose what was typed.
 */
import type { McpServerDetail, McpServerInput, McpTransport } from "shared";

import type { PairRow } from "@/components/settings/pair-rows";

export type McpDraft = {
	name: string;
	transport: McpTransport;
	command: string;
	args: string;
	env: PairRow[];
	url: string;
	headers: PairRow[];
	description: string;
	enabled: boolean;
};

const rowsOf = (keys: string[]): PairRow[] => keys.map((key) => ({ key, value: "", stored: true }));

const lines = (text: string): string[] =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");

const pairsOf = (rows: PairRow[]): Record<string, string> | undefined => {
	const filled = rows.filter((row) => row.key.trim() !== "");
	if (filled.length === 0) return undefined;
	return Object.fromEntries(filled.map((row) => [row.key.trim(), row.value]));
};

export const draftOf = (detail: McpServerDetail | undefined): McpDraft => ({
	name: detail?.name ?? "",
	transport: detail?.transport ?? "stdio",
	command: detail?.command ?? "",
	args: (detail?.args ?? []).join("\n"),
	env: rowsOf(detail?.envKeys ?? []),
	url: detail?.url ?? "",
	headers: rowsOf(detail?.headerKeys ?? []),
	description: detail?.description ?? "",
	enabled: detail?.enabled ?? true,
});

/** A blank value on a stored row keeps it; the server applies that. */
export const inputOf = (draft: McpDraft): McpServerInput => {
	const common = {
		name: draft.name.trim(),
		description: draft.description.trim() || undefined,
		enabled: draft.enabled,
	};
	if (draft.transport === "stdio") {
		return {
			...common,
			transport: "stdio",
			command: draft.command.trim(),
			args: lines(draft.args),
			env: pairsOf(draft.env),
		};
	}
	return {
		...common,
		transport: "http",
		url: draft.url.trim(),
		headers: pairsOf(draft.headers),
	};
};
