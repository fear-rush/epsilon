/**
 * The form rules for one MCP server. The shared schema stays the contract; this
 * adds what only the form knows: a name that is free in its own file, a command
 * or URL that is there, an absolute URL, map rows that are complete, and a
 * timeout in seconds. Only the fields that fail come back, so the caller can put
 * each message under its own control.
 *
 * The `oauth`, `toolExposure` and `auth` rules are pi's own, taken from
 * `shared/mcp/rules` so a value this form accepts is one pi loads.
 */
import { z } from "zod";
import { mcpNameSchema, mcpOAuthSchema, authProviderProblem, oauthProblem } from "shared";

import type { PairRow } from "@/components/patterns/section/pair-rows";
import type { McpDraft } from "./mcp-draft";

export type McpField =
	| "name"
	| "command"
	| "env"
	| "url"
	| "headers"
	| "timeout"
	| "toolExposure"
	| "oauth"
	| "authProvider";

export const mcpFields: readonly McpField[] = [
	"name",
	"command",
	"env",
	"url",
	"headers",
	"timeout",
	"toolExposure",
	"oauth",
	"authProvider",
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

/** pi matches a tool name exactly or a `*` pattern; an empty or padded key matches nothing. */
const toolExposureProblem = (rows: McpDraft["toolExposure"]): string | undefined => {
	const patterns = rows.map((row) => row.pattern);
	if (patterns.some((pattern) => pattern.trim() === "")) {
		return "Every rule needs a tool name or pattern.";
	}
	if (patterns.some((pattern) => pattern.trim() !== pattern)) {
		return "A tool name cannot start or end with a space.";
	}
	const duplicate = patterns.find((pattern, index) => patterns.indexOf(pattern) !== index);
	return duplicate === undefined ? undefined : `"${duplicate}" is listed twice.`;
};

/** The OAuth rules pi applies before it connects: they decide whether the save is a valid entry. */
const callbackPortProblem = (value: string): string | undefined => {
	const text = value.trim();
	if (text === "") return undefined;
	const port = Number(text);
	return Number.isInteger(port) && port >= 1 && port <= 65_535
		? undefined
		: "oauth.callbackPort must be a port number.";
};

const oauthFormProblem = (draft: McpDraft): string | undefined => {
	const portProblem = callbackPortProblem(draft.oauthCallbackPort);
	if (portProblem !== undefined) return portProblem;
	const parsed = mcpOAuthSchema.safeParse({
		clientId: draft.oauthClientId.trim() || undefined,
		clientSecret: draft.oauthClientSecret || undefined,
		callbackPort:
			draft.oauthCallbackPort.trim() === "" ? undefined : Number(draft.oauthCallbackPort.trim()),
		callbackUrl: draft.oauthCallbackUrl.trim() || undefined,
		scope: draft.oauthScope.trim() || undefined,
		clientName: draft.oauthClientName.trim() || undefined,
		clientRegistration:
			draft.oauthClientRegistration === "auto" ? undefined : draft.oauthClientRegistration,
		authServerMetadataUrl: draft.oauthAuthServerMetadataUrl.trim() || undefined,
	});
	if (!parsed.success) {
		return parsed.error.issues[0]?.message ?? "The OAuth options could not be read.";
	}
	return oauthProblem(parsed.data);
};

/**
 * `auth.provider` must be a provider pi knows, because the entry sends that
 * provider's token. A blank field means the server uses OAuth or nothing. An
 * empty list means the snapshot has not loaded; the rule is then the URL's only.
 */
const authProviderProblemOf = (
	draft: McpDraft,
	providerIds: ReadonlySet<string>,
): string | undefined => {
	if (draft.scope !== "global" || draft.transport !== "http") return undefined;
	const provider = draft.authProvider.trim();
	if (provider === "") return undefined;
	if (providerIds.size > 0 && !providerIds.has(provider)) {
		return `pi has no provider "${provider}".`;
	}
	return authProviderProblem(draft.url.trim());
};

export function mcpFieldErrors(
	draft: McpDraft,
	takenNames: ReadonlySet<string>,
	providerIds: ReadonlySet<string>,
): McpFieldErrors {
	const errors: McpFieldErrors = {};
	const name = nameProblem(draft, takenNames);
	if (name !== undefined) errors.name = name;

	const toolExposure = toolExposureProblem(draft.toolExposure);
	if (toolExposure !== undefined) errors.toolExposure = toolExposure;

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
		const oauth = oauthFormProblem(draft);
		if (oauth !== undefined) errors.oauth = oauth;
		const auth = authProviderProblemOf(draft, providerIds);
		if (auth !== undefined) errors.authProvider = auth;
	}

	const timeout = timeoutProblem(draft.timeout);
	if (timeout !== undefined) errors.timeout = timeout;

	return errors;
}
