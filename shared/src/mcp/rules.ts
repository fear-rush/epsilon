/**
 * The MCP rules the browser form and the server both run: the closed value sets,
 * the name pattern, the tool namespace, and the three rules pi applies to an
 * entry beyond its shape (`toolExposure`, `oauth` and `auth`). Request and
 * response shapes live in the server's contract, which composes these.
 */
import { z } from "zod";

export const mcpTransportSchema = z.enum(["stdio", "http"]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

/** The file a server lives in: `<agent home>/mcp.json` or `<project>/.pi/mcp.json`. */
export const mcpScopeSchema = z.enum(["global", "project"]);

export type McpScope = z.infer<typeof mcpScopeSchema>;

/** How a server's tools reach the model (pi's `exposure`). */
export const mcpExposureSchema = z.enum(["codemode", "deferred", "direct", "hidden"]);

export type McpExposure = z.infer<typeof mcpExposureSchema>;

/** pi connects `codemode` servers through codemode scripts unless the file says otherwise. */
export const MCP_DEFAULT_EXPOSURE: McpExposure = "codemode";

/** What a project entry may change of the global server of its name. */
export const mcpOverrideKeySchema = z.enum(["enabled", "exposure", "toolExposure"]);

export type McpOverrideKey = z.infer<typeof mcpOverrideKeySchema>;

/** The key under `mcpServers`, and the URL segment. */
export const mcpNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, dashes and underscores");

/**
 * How a global server and the project entry of its name relate. The global side
 * is `replaced-by-project` (the project defines its own server) or
 * `overridden-by-project` (the project changes some keys); the project side of a
 * replacement is `replaces-global`.
 */
export const mcpRelationSchema = z.enum([
	"replaces-global",
	"replaced-by-project",
	"overridden-by-project",
]);

export type McpRelation = z.infer<typeof mcpRelationSchema>;

/**
 * The tool namespace pi gives a server: `mcp__<server>` with `-` replaced by `_`.
 * It is also the credential key prefix in `mcp-auth.json` and the `namespace` of
 * every `ToolInfo` a connected server registers.
 */
export const mcpNamespaceOf = (server: string): string => `mcp__${server.replace(/-/g, "_")}`;

/** Per-tool exposure overrides: a tool name, or a pattern where `*` matches any characters. */
export const mcpToolExposureSchema = z.record(z.string().min(1), mcpExposureSchema);

export type McpToolExposure = z.infer<typeof mcpToolExposureSchema>;

/** Every exposure value pi will act on for one server, its own plus the per-tool ones. */
export const mcpExposuresOf = (config: {
	exposure?: McpExposure | undefined;
	toolExposure?: McpToolExposure | undefined;
}): McpExposure[] => [
	config.exposure ?? MCP_DEFAULT_EXPOSURE,
	...Object.values(config.toolExposure ?? {}),
];

/** How pi identifies itself to an authorization server that cannot register clients. */
export const mcpOAuthClientRegistrationSchema = z.enum(["dcr", "cimd"]);

export type McpOAuthClientRegistration = z.infer<typeof mcpOAuthClientRegistrationSchema>;

/**
 * The OAuth options pi resolves before it connects an HTTP server. A loose object
 * so a file written by a newer pi keeps the keys this version does not model.
 */
export const mcpOAuthSchema = z.looseObject({
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	callbackPort: z.number().int().optional(),
	callbackUrl: z.string().optional(),
	scope: z.string().optional(),
	clientName: z.string().optional(),
	clientRegistration: mcpOAuthClientRegistrationSchema.optional(),
	authServerMetadataUrl: z.string().optional(),
});

export type McpOAuth = z.infer<typeof mcpOAuthSchema>;

/**
 * The `oauth` block as JSON: every option the file may hold, unknown ones
 * included, so a write can keep what this version does not model.
 */
export const mcpOAuthJsonSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export type McpOAuthJson = z.infer<typeof mcpOAuthJsonSchema>;

/** The three hosts pi's OAuth callback server can serve, spelled as `URL` spells them. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export const isLoopbackHostname = (hostname: string): boolean => LOOPBACK_HOSTS.includes(hostname);

/**
 * pi's redirect rule: a plain HTTP URI on a loopback host, with no query and no
 * fragment, because that is what the loopback callback server can serve.
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

/**
 * Every rule pi's own validator applies to `oauth`, in its order, so the panel
 * says "pi skips this entry" for the same reasons pi does. Types are the schema's.
 */
export function oauthProblem(oauth: McpOAuth): string | undefined {
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
	if (oauth.clientName !== undefined && oauth.clientName.trim() === "") {
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
 * `auth` sends the token of a `/login` provider, so pi refuses to send it to a
 * plain-HTTP server that is not on this machine.
 */
export function authProviderProblem(url: string): string | undefined {
	if (!URL.canParse(url)) return "auth needs an http or https URL.";
	const parsed = new URL(url);
	const loopbackHttp = parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
	return parsed.protocol === "https:" || loopbackHttp
		? undefined
		: "auth requires an https URL, or http on localhost, 127.0.0.1 or [::1].";
}
