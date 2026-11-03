import { McpExposure, McpOverrideKey } from "#protocol/config/mcp";
import type { McpOAuthView } from "#protocol/config/mcp";

/**
 * The MCP rules both sides run: the closed value sets, the name pattern, the tool
 * namespace, and the rules pi applies to an entry beyond its shape (`oauth`, `auth` and a
 * tool's exposure).
 *
 * pi exports no validator Epsilon can reach through its package, so these are pi's rules
 * restated from `docs/pi-sdk.md` and its installed `mcp.json` reader. The server refuses a
 * save that breaks them; the form labels its choices from the same lists.
 */

/** pi's default when a server writes no `exposure`. */
export const MCP_DEFAULT_EXPOSURE: McpExposure = "codemode";

/** The server key under `mcpServers`, and the URL segment on the wire. */
export const isMcpName = (value: string): boolean => /^[A-Za-z0-9_-]+$/.test(value);

/** Every `exposure` value pi accepts in the file. */
export const mcpExposures: ReadonlyArray<McpExposure> = McpExposure.literals;

/** The keys a project entry may set when it overrides a global server, in pi's order. */
export const mcpOverrideKeys: ReadonlyArray<McpOverrideKey> = McpOverrideKey.literals;

/**
 * The tool namespace pi gives a server: `mcp__<server>` with `-` replaced by `_`. It is
 * also the credential key prefix in `mcp-auth.json` and the `namespace` of every
 * `ToolInfo` a connected server registers.
 */
export const mcpNamespaceOf = (server: string): string => `mcp__${server.replaceAll("-", "_")}`;

/** The exposure settings of one entry, as its own keys name them. */
export type McpExposureSettings = {
	readonly exposure?: McpExposure | undefined;
	readonly toolExposure?: Readonly<Record<string, McpExposure>> | undefined;
};

/** Every exposure value pi will act on for one server: its own, then its per-tool ones. */
export const mcpExposuresOf = (settings: McpExposureSettings): ReadonlyArray<McpExposure> => [
	settings.exposure ?? MCP_DEFAULT_EXPOSURE,
	...Object.values(settings.toolExposure ?? {}),
];

/** The exposures of one entry that only codemode or `tool_search` can reach. */
export const indirectExposuresOf = (settings: McpExposureSettings): ReadonlyArray<McpExposure> =>
	mcpExposuresOf(settings).filter((exposure) => exposure === "codemode" || exposure === "deferred");

/** The three hosts pi's OAuth callback server can serve, spelled as `URL` spells them. */
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLoopbackHostname = (hostname: string): boolean => loopbackHosts.has(hostname);

/** An http or https URL; anything else is not a server address pi will connect. */
export const isHttpUrl = (value: string): boolean => {
	if (!URL.canParse(value)) return false;
	const protocol = new URL(value).protocol;
	return protocol === "http:" || protocol === "https:";
};

/**
 * pi's redirect rule: a plain HTTP URI on a loopback host, with no query and no fragment,
 * because that is what the loopback callback server can serve.
 */
export function callbackUrlProblem(value: string): string | undefined {
	if (!URL.canParse(value)) return "oauth.callbackUrl must be an absolute URL.";
	const url = new URL(value);
	if (url.protocol === "http:" && isLoopbackHostname(url.hostname)) {
		return url.search === "" && url.hash === ""
			? undefined
			: "oauth.callbackUrl cannot carry a query or a fragment.";
	}
	return "oauth.callbackUrl must be an http URI on localhost, 127.0.0.1 or [::1].";
}

/** Every rule pi's own validator applies to `oauth`, in its order. */
export function oauthProblem(oauth: McpOAuthView): string | undefined {
	const port = oauth.callbackPort;
	if (port !== undefined && (port < 1 || port > 65535)) {
		return "oauth.callbackPort must be a port number.";
	}
	if (oauth.callbackUrl !== undefined) {
		const problem = callbackUrlProblem(oauth.callbackUrl);
		if (problem !== undefined) return problem;
		const urlPort = new URL(oauth.callbackUrl).port;
		if (urlPort !== "" && port !== undefined && Number(urlPort) !== port) {
			return "oauth.callbackUrl and oauth.callbackPort name different ports.";
		}
	}
	if (oauth.clientName?.trim() === "") {
		return "oauth.clientName must be a non-empty string.";
	}
	if (oauth.clientRegistration === "cimd") {
		if (oauth.clientId !== undefined || oauth.clientName !== undefined) {
			return 'oauth.clientRegistration "cimd" cannot be combined with oauth.clientId or oauth.clientName.';
		}
		if (oauth.callbackUrl !== undefined) {
			const url = new URL(oauth.callbackUrl);
			if (url.hostname === "[::1]" || url.pathname !== "/callback") {
				return 'oauth.clientRegistration "cimd" needs oauth.callbackUrl on localhost or 127.0.0.1 with the path /callback.';
			}
		}
	}
	const metadata = oauth.authServerMetadataUrl;
	if (metadata !== undefined) {
		const url = URL.canParse(metadata) ? new URL(metadata) : undefined;
		const loopbackHttp = url?.protocol === "http:" && isLoopbackHostname(url.hostname);
		if (url === undefined || (url.protocol !== "https:" && !loopbackHttp)) {
			return "oauth.authServerMetadataUrl must be an https URL, or http on localhost, 127.0.0.1 or [::1].";
		}
	}
	return undefined;
}

/**
 * `auth` sends the token of a `/login` provider, so pi refuses to send it to a plain-HTTP
 * server that is not on this machine.
 */
export function authProviderProblem(url: string): string | undefined {
	if (!URL.canParse(url)) return "auth needs an http or https URL.";
	const parsed = new URL(url);
	if (!isHttpUrl(url)) return "auth needs an http or https URL.";
	const loopbackHttp = parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
	return parsed.protocol === "https:" || loopbackHttp
		? undefined
		: "auth requires an https URL, or http on localhost, 127.0.0.1 or [::1].";
}
