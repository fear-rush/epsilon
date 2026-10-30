/**
 * The editable state of one MCP server, and the conversions around it. The
 * transport decides which target the write carries; the other target stays in
 * the draft so switching back does not lose what was typed. `enabled` is not
 * here: the list's checkbox owns that key, so a save cannot undo a toggle.
 */
import type { McpExposure, McpScope, McpTransport } from "shared";

import type { PairRow } from "@/features/settings/kit/pair-rows";
import type { McpServerDetail, McpServerInput } from "@/api/types";

export type McpDraft = {
	name: string;
	scope: McpScope;
	transport: McpTransport;
	command: string;
	args: string;
	env: PairRow[];
	cwd: string;
	url: string;
	headers: PairRow[];
	description: string;
	exposure: McpExposure;
	timeout: string;
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

export const draftOf = (detail: McpServerDetail | undefined, scope: McpScope): McpDraft => ({
	name: detail?.name ?? "",
	scope,
	transport: detail?.transport ?? "stdio",
	command: detail?.command ?? "",
	args: (detail?.args ?? []).join("\n"),
	env: rowsOf(detail?.envKeys ?? []),
	cwd: detail?.cwd ?? "",
	url: detail?.url ?? "",
	headers: rowsOf(detail?.headerKeys ?? []),
	description: detail?.description ?? "",
	exposure: detail?.exposure ?? "codemode",
	timeout: detail?.timeout !== undefined ? String(detail.timeout) : "",
});

/** A blank value on a stored row keeps it; the server applies that. */
export const inputOf = (draft: McpDraft): McpServerInput => {
	const common = {
		name: draft.name.trim(),
		scope: draft.scope,
		description: draft.description.trim() || undefined,
		// `codemode` is pi's default, so the key is left out instead of written.
		exposure: draft.exposure === "codemode" ? undefined : draft.exposure,
		timeout: draft.timeout.trim() === "" ? undefined : Number(draft.timeout),
	};
	if (draft.transport === "stdio") {
		return {
			...common,
			transport: "stdio",
			command: draft.command.trim(),
			args: lines(draft.args),
			env: pairsOf(draft.env),
			cwd: draft.cwd.trim() || undefined,
		};
	}
	return {
		...common,
		transport: "http",
		url: draft.url.trim(),
		headers: pairsOf(draft.headers),
	};
};
