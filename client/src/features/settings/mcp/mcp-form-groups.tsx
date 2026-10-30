/**
 * The two optional groups under an MCP server's form: what the server does in
 * this project, and what the file and pi's runtime say about it. Every key the
 * form edits moved into the form itself, so nothing here is a read-only copy of
 * a field above.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";
import type { McpLive } from "@/api/types";
import type { McpServerEntryDetail } from "./mcp-detail";

/** A global server's state in this project: its override, or the absence of one. */
export function McpProjectGroup({
	detail,
	projectDir,
	pending,
	error,
	onAction,
}: {
	detail: McpServerEntryDetail;
	projectDir: string | undefined;
	pending: boolean;
	error: Error | null;
	onAction: (value: "inherit" | "on" | "off") => void;
}) {
	const overridden = detail.relation === "overridden-by-project";
	const replaced = detail.relation === "replaced-by-project";
	return (
		<SettingsGroup title="This project" description={projectDir}>
			<SettingsBlock>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-muted-foreground">
						{replaced
							? "This project's own server replaces this one."
							: overridden
								? "This project changes this server with an override in its .pi/mcp.json."
								: detail.enabled
									? "Sessions in this project connect this server."
									: "This server is off in its own file, so sessions here skip it too."}
					</p>
					{!replaced && (
						<div className="flex items-center gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={pending}
								onClick={() => onAction(overridden ? "inherit" : detail.enabled ? "off" : "on")}
							>
								{pending && <Spinner data-icon="inline-start" />}
								{overridden
									? "Use the global setting"
									: detail.enabled
										? "Turn off in this project"
										: "Turn on in this project"}
							</Button>
						</div>
					)}
				</div>
				{error !== null && (
					<Alert variant="destructive" className="mt-3">
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				)}
			</SettingsBlock>
		</SettingsGroup>
	);
}

/**
 * What pi's runtime and the agent home say about this server. pi exposes no
 * connection state through the SDK: a server's tools appear once it connected, so
 * "connected" here means "registered tools in a live session", and the absence of
 * tools is reported as exactly that, never as a failure.
 */
export function McpDiagnosticsGroup({
	detail,
	live,
}: {
	detail: McpServerEntryDetail;
	live: McpLive | undefined;
}) {
	const replaced = detail.relation === "replaced-by-project";
	const tools = replaced
		? undefined
		: live?.servers.find((server) => server.name === detail.name)?.tools;
	const sessions = live?.sessions ?? 0;
	const connected = replaced
		? "This project's own entry replaces this server, so sessions here connect that one."
		: tools === undefined
			? sessions === 0
				? "No session is open, so nothing has connected yet."
				: `No tools are registered in the ${sessions} live ${sessions === 1 ? "session" : "sessions"}. pi does not report whether the server failed, needs a sign-in, or is still connecting.`
			: `Connected in a live session, with ${tools} ${tools === 1 ? "tool" : "tools"} registered.`;
	return (
		<SettingsGroup title="Runtime">
			<SettingsBlock>
				<dl className="grid gap-2 text-sm">
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">Connection</dt>
						<dd>{connected}</dd>
					</div>
					{detail.transport === "http" && (
						<div className="flex flex-wrap gap-2">
							<dt className="text-muted-foreground">Sign-in</dt>
							<dd>
								{detail.credentialsStored
									? "mcp-auth.json holds a credential for this server."
									: "No stored credential."}{" "}
								Signing in and out happens in a terminal using the same agent home, not here.
							</dd>
						</div>
					)}
				</dl>
				<div className="mt-3 grid gap-1">
					<p className="text-xs font-medium">Server log</p>
					{detail.log.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							pi logged nothing for this server. Entries appear here once it sends log messages.
						</p>
					) : (
						<pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
							{detail.log.join("\n")}
						</pre>
					)}
				</div>
			</SettingsBlock>
		</SettingsGroup>
	);
}
