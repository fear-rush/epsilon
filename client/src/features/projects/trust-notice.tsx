/**
 * What trusting a folder means, in one place: the full-page gate and the folder
 * dialog say the same thing.
 */
import type { ProjectStatus } from "@/api/types";

export function TrustNotice({ status }: { status: ProjectStatus }) {
	return (
		<div className="grid gap-2 text-body text-muted-foreground">
			<p>The agent can read files here and, when you allow it, run commands and change files.</p>
			{status.hasProjectResources && (
				<p>
					Its <span className="font-mono">.pi</span> or{" "}
					<span className="font-mono">.agents/skills</span> also load: settings, extensions, skills
					and MCP servers that can run code on this machine.
				</p>
			)}
		</div>
	);
}
