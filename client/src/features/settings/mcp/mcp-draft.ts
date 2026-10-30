/**
 * The editable state of one MCP server, and the conversions around it. The
 * transport decides which target the write carries; the other target stays in
 * the draft so switching back does not lose what was typed. `enabled` is not
 * here: the list's checkbox owns that key, so a save cannot undo a toggle.
 *
 * Everything the form can write is here, so a save replaces every key pi
 * validates and never leaves a key from the file that this version of the panel
 * cannot see. An invalid entry fills the draft from the raw target the server
 * still read, so a repair does not start from the name alone.
 */
import type { McpExposure, McpOAuthClientRegistration, McpScope, McpTransport } from "shared";

import type { PairRow } from "@/features/settings/kit/pair-rows";
import type { McpOAuthInput, McpServerDetail, McpServerInput } from "@/api/types";

/** One `toolExposure` row: a tool name or `*` pattern, and how the model reaches it. */
export type ExposureRow = { pattern: string; exposure: McpExposure };

/** `auto` writes no `clientRegistration`, which is pi's dynamic-registration default. */
type ClientRegistrationChoice = "auto" | McpOAuthClientRegistration;

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
	toolExposure: ExposureRow[];
	timeout: string;
	oauthClientId: string;
	oauthClientSecret: string;
	oauthClientSecretStored: boolean;
	oauthCallbackPort: string;
	oauthCallbackUrl: string;
	oauthScope: string;
	oauthClientName: string;
	oauthClientRegistration: ClientRegistrationChoice;
	oauthAuthServerMetadataUrl: string;
	authProvider: string;
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

/** The exposure rows of a config, in the order the file lists them. */
const exposureRows = (exposure: Record<string, McpExposure> | undefined): ExposureRow[] =>
	Object.entries(exposure ?? {}).map(([pattern, value]) => ({ pattern, exposure: value }));

/** A new server starts from the scope alone; an invalid one keeps what pi could still read. */
export const draftOf = (detail: McpServerDetail | undefined, scope: McpScope): McpDraft => {
	const server = detail?.kind === "server" || detail?.kind === "invalid" ? detail : undefined;
	const transport = server?.transport ?? "stdio";
	return {
		name: detail?.name ?? "",
		scope,
		transport,
		command: server?.command ?? "",
		args: (server?.args ?? []).join("\n"),
		env: rowsOf(server?.envKeys ?? []),
		cwd: server?.cwd ?? "",
		url: server?.url ?? "",
		headers: rowsOf(server?.headerKeys ?? []),
		description: server?.description ?? "",
		exposure: server?.exposure ?? "codemode",
		toolExposure: exposureRows(server?.toolExposure),
		timeout: server?.timeout !== undefined ? String(server.timeout) : "",
		oauthClientId: server?.oauth?.clientId ?? "",
		oauthClientSecret: "",
		oauthClientSecretStored: server?.oauthClientSecret ?? false,
		oauthCallbackPort:
			server?.oauth?.callbackPort !== undefined ? String(server.oauth.callbackPort) : "",
		oauthCallbackUrl: server?.oauth?.callbackUrl ?? "",
		oauthScope: server?.oauth?.scope ?? "",
		oauthClientName: server?.oauth?.clientName ?? "",
		oauthClientRegistration: server?.oauth?.clientRegistration ?? "auto",
		oauthAuthServerMetadataUrl: server?.oauth?.authServerMetadataUrl ?? "",
		authProvider: server?.authProvider ?? "",
	};
};

/**
 * The OAuth block to send, or undefined to leave the file's block alone. A stored
 * secret stays unless a new one is typed, so a blank field is sent as a blank
 * `clientSecret` rather than as a missing block.
 */
const oauthOf = (draft: McpDraft): McpOAuthInput | undefined => {
	const block: McpOAuthInput = {};
	if (draft.oauthClientId.trim() !== "") block.clientId = draft.oauthClientId.trim();
	if (draft.oauthCallbackPort.trim() !== "") block.callbackPort = Number(draft.oauthCallbackPort);
	if (draft.oauthCallbackUrl.trim() !== "") block.callbackUrl = draft.oauthCallbackUrl.trim();
	if (draft.oauthScope.trim() !== "") block.scope = draft.oauthScope.trim();
	if (draft.oauthClientName.trim() !== "") block.clientName = draft.oauthClientName.trim();
	if (draft.oauthClientRegistration !== "auto") {
		block.clientRegistration = draft.oauthClientRegistration;
	}
	if (draft.oauthAuthServerMetadataUrl.trim() !== "") {
		block.authServerMetadataUrl = draft.oauthAuthServerMetadataUrl.trim();
	}
	if (draft.oauthClientSecret !== "") block.clientSecret = draft.oauthClientSecret;
	// Keep the stored secret: an empty block would drop the whole `oauth` key.
	if (Object.keys(block).length === 0 && draft.oauthClientSecretStored) {
		block.clientSecret = "";
	}
	return Object.keys(block).length === 0 ? undefined : block;
};

/** A blank value on a stored row keeps it; the server applies that. */
export const inputOf = (draft: McpDraft): McpServerInput => {
	const common = {
		name: draft.name.trim(),
		scope: draft.scope,
		description: draft.description.trim() || undefined,
		// `codemode` is pi's default, so the key is left out instead of written.
		exposure: draft.exposure === "codemode" ? undefined : draft.exposure,
		toolExposure:
			draft.toolExposure.length === 0
				? undefined
				: Object.fromEntries(draft.toolExposure.map((row) => [row.pattern.trim(), row.exposure])),
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
		oauth: oauthOf(draft),
		// pi refuses `auth` in a project file, so the field is not offered there.
		authProvider:
			draft.scope === "global" && draft.authProvider.trim() !== ""
				? draft.authProvider.trim()
				: undefined,
	};
};
