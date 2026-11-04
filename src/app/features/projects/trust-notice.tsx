import type { ProjectStatus } from "#protocol/config/projects";
/**
 * What trusting a folder means, in one place: the full-page gate and the folder
 * dialog say the same thing.
 */
import { Notice } from "@/components/patterns/status/notice";

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
			{status.parent !== null && (
				<p>
					Trusting the parent <span className="font-mono">{status.parent}</span> trusts this folder
					and every folder under it.
				</p>
			)}
			{status.settingsProblems !== undefined && status.settingsProblems.length > 0 && (
				<Notice tone="warning" title="pi cannot load these project settings">
					<ul className="grid gap-1">
						{status.settingsProblems.map((problem) => (
							<li key={`${problem.path ?? ""}:${problem.message}`}>
								<code>{problem.path ?? "settings.json"}</code>: {problem.message}
							</li>
						))}
					</ul>
					<p>pi ignores that file, so the project loads with the home&apos;s values.</p>
				</Notice>
			)}
		</div>
	);
}
