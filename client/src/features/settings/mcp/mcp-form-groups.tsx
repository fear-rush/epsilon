/**
 * The two optional groups under an MCP server's form: what the server does in
 * this project, and the keys the form preserves without editing.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";
import type { McpServerDetail } from "@/api/types";

/** A global server's state in this project: its override, or the absence of one. */
export function McpProjectGroup({
	detail,
	projectDir,
	pending,
	error,
	onAction,
}: {
	detail: McpServerDetail;
	projectDir: string | undefined;
	pending: boolean;
	error: Error | null;
	onAction: (value: "inherit" | "on" | "off") => void;
}) {
	const overridden = detail.overriddenByProject === true;
	return (
		<SettingsGroup title="This project" description={projectDir}>
			<SettingsBlock>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-muted-foreground">
						{detail.replacedByProject === true
							? "This project's own server replaces this one."
							: overridden
								? "This project changes this server with an override in its .pi/mcp.json."
								: detail.enabled
									? "Sessions in this project connect this server."
									: "This server is off in its own file, so sessions here skip it too."}
					</p>
					{detail.replacedByProject !== true && (
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

/** OAuth, `auth` and `toolExposure`: named, never sent with their values, kept on save. */
export function McpKeptGroup({ detail }: { detail: McpServerDetail }) {
	return (
		<SettingsGroup title="Kept as written">
			<SettingsBlock>
				<dl className="grid gap-2 text-sm">
					{detail.oauthKeys.length > 0 && (
						<div className="flex flex-wrap gap-2">
							<dt className="text-muted-foreground">OAuth</dt>
							<dd>{detail.oauthKeys.join(", ")}</dd>
						</div>
					)}
					{detail.authProvider !== undefined && (
						<div className="flex flex-wrap gap-2">
							<dt className="text-muted-foreground">Auth provider</dt>
							<dd>{detail.authProvider}</dd>
						</div>
					)}
					{detail.toolExposureKeys.length > 0 && (
						<div className="flex flex-wrap gap-2">
							<dt className="text-muted-foreground">Tool exposure rules</dt>
							<dd>{detail.toolExposureKeys.join(", ")}</dd>
						</div>
					)}
				</dl>
				<p className="mt-3 text-xs text-muted-foreground">
					These keys are kept when you save. Edit them in the file; this form does not send their
					values to the browser.
				</p>
			</SettingsBlock>
		</SettingsGroup>
	);
}
