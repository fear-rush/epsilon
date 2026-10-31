/**
 * The add dialog's data, apart from its drawing: the three ways in produce the
 * same candidate list, and a candidate becomes the write route's input once its
 * scope and values are known. Parsing the paste, and the placeholder rules, are
 * `shared/mcp/import` so the server's rules and the browser's stay one.
 */
import { mcpNameSchema, parseMcpPaste } from "shared";
import type { ImportedServer, McpScope } from "shared";

import type { McpServerInput } from "@/api/types";

export type AddMode = "registry" | "paste" | "command" | "url";

/** A server the dialog is about to write, and the entry of the paste it came from. */
export type Candidate = {
	/** Stable within one dialog session: the index of the entry in the paste. */
	id: number;
	name: string;
	server: ImportedServer;
	/** Every value is final: a typed value that looks like a placeholder must not be replaced again. */
	resolved?: boolean;
};

/** An entry of the paste the preview lists, whether or not it can be added. */
type PreviewEntry = {
	id: number;
	/** What the entry was pasted as, or the name typed for a single entry. */
	name: string;
	server: ImportedServer | undefined;
	problem: string | undefined;
	ignored: string[];
};

/** What step 1 of the add dialog holds, whichever way in is picked. */
export type SourceDraft = {
	mode: AddMode;
	paste: string;
	/** The name for a pasted single entry. */
	pasteName: string;
	name: string;
	command: string;
	args: string;
	url: string;
	/** The paste entries left unchecked. */
	skipped: ReadonlySet<number>;
};

export const emptySource: SourceDraft = {
	mode: "registry",
	paste: "",
	pasteName: "",
	name: "",
	command: "",
	args: "",
	url: "",
	skipped: new Set(),
};

export type PasteState =
	| { kind: "empty" }
	| { kind: "error"; error: string }
	| { kind: "entries"; entries: PreviewEntry[]; needsName: boolean };

/** What the paste box holds, read into the entries the preview shows. */
export function previewOfPaste(text: string, typedName: string): PasteState {
	if (text.trim() === "") return { kind: "empty" };
	const parsed = parseMcpPaste(text);
	if (!parsed.ok) return { kind: "error", error: parsed.error };
	return {
		kind: "entries",
		needsName: parsed.needsName,
		entries: parsed.entries.map((entry, id) => {
			if (!parsed.needsName) return { id, ...entry };
			const name = typedName.trim();
			const named = mcpNameSchema.safeParse(name);
			const problem =
				entry.problem ??
				(name === ""
					? "Name this server."
					: named.success
						? undefined
						: named.error.issues[0]?.message);
			return { id, ...entry, name, problem };
		}),
	};
}

/** The text of the name problem for a typed name, or undefined when it is a good name. */
export const nameProblemOf = (name: string): string | undefined => {
	if (name.trim() === "") return "Name this server.";
	const parsed = mcpNameSchema.safeParse(name.trim());
	return parsed.success ? undefined : parsed.error.issues[0]?.message;
};

/** The write route's input for a candidate. Empty maps are left out, and so is pi's default exposure. */
export function inputOfCandidate(candidate: Candidate, scope: McpScope): McpServerInput {
	const { server } = candidate;
	const common = {
		name: candidate.name,
		scope,
		description: server.description,
		exposure: server.exposure === "codemode" ? undefined : server.exposure,
		toolExposure:
			server.toolExposure !== undefined && Object.keys(server.toolExposure).length > 0
				? server.toolExposure
				: undefined,
		timeout: server.timeout,
	};
	if (server.transport === "stdio") {
		return {
			...common,
			transport: "stdio",
			command: server.command,
			args: server.args,
			env: Object.keys(server.env).length === 0 ? undefined : server.env,
			cwd: server.cwd,
		};
	}
	return {
		...common,
		transport: "http",
		url: server.url,
		headers: Object.keys(server.headers).length === 0 ? undefined : server.headers,
	};
}

const lines = (text: string): string[] =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");

/** The servers step 1 would add: what the chosen way holds, minus what is refused or unchecked. */
export function candidatesOf(source: SourceDraft, paste: PasteState): Candidate[] {
	// The registry way builds its candidate from the picked option, in the dialog.
	if (source.mode === "registry") return [];
	if (source.mode === "paste") {
		if (paste.kind !== "entries") return [];
		return paste.entries.flatMap((entry) =>
			entry.server === undefined || entry.problem !== undefined || source.skipped.has(entry.id)
				? []
				: [{ id: entry.id, name: entry.name, server: entry.server }],
		);
	}
	const name = source.name.trim();
	if (nameProblemOf(name) !== undefined) return [];
	if (source.mode === "command") {
		const command = source.command.trim();
		if (command === "") return [];
		return [
			{
				id: 0,
				name,
				server: { transport: "stdio", command, args: lines(source.args), env: {} },
			},
		];
	}
	const url = source.url.trim();
	if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) return [];
	return [{ id: 0, name, server: { transport: "http", url, headers: {} } }];
}
