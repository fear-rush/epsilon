import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";

import { setSkillFolderLinked } from "@/api/endpoints";
import type { ForeignSkillView } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ListGroup } from "@/components/patterns/list/list-group";
import { Notice } from "@/components/patterns/status/notice";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";

/**
 * Skills other agents keep in their own folders. Linking adds the folder to pi's
 * `skills` setting, so pi reads the skills where they are; nothing is copied and
 * unlinking removes only that setting entry.
 */

const AGENTS: Record<ForeignSkillView["agent"], string> = {
	"claude-code": "Claude Code",
	codex: "Codex",
};

type Folder = {
	folder: string;
	agent: ForeignSkillView["agent"];
	scope: ForeignSkillView["scope"];
	linked: boolean;
	skills: ForeignSkillView[];
};

const byFolder = (skills: readonly ForeignSkillView[]): Folder[] => {
	const folders = new Map<string, Folder>();
	for (const skill of skills) {
		const known = folders.get(skill.folder);
		if (known === undefined) {
			folders.set(skill.folder, {
				folder: skill.folder,
				agent: skill.agent,
				scope: skill.scope,
				linked: skill.linked,
				skills: [skill],
			});
		} else {
			known.skills.push(skill);
		}
	}
	return [...folders.values()];
};

export function ForeignSkills({ skills }: { skills: readonly ForeignSkillView[] }) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const folders = useMemo(() => byFolder(skills), [skills]);
	const link = useMutation({
		mutationFn: (input: { folder: string; linked: boolean }) =>
			setSkillFolderLinked(project, input.folder, input.linked),
		onSuccess: () => refresh(),
	});
	if (folders.length === 0) return null;
	return (
		<ListGroup title="Found in other agents">
			{link.error !== null && <Notice tone="error">{link.error.message}</Notice>}
			{folders.map((entry) => {
				const pending = link.isPending && link.variables.folder === entry.folder;
				return (
					<div key={entry.folder} className="grid min-w-0 gap-row rounded-md pad-item">
						<div className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate text-body font-medium">
								{AGENTS[entry.agent]}
							</span>
							<Badge variant="outline">{entry.scope === "project" ? "Project" : "Global"}</Badge>
							{entry.linked && <Badge variant="secondary">Linked</Badge>}
						</div>
						<span className="truncate text-meta text-muted-foreground" title={entry.folder}>
							{entry.folder}
						</span>
						<span className="truncate text-meta text-muted-foreground">
							{entry.skills.map((skill) => skill.name).join(", ")}
						</span>
						{entry.skills.some((skill) => skill.warnings.length > 0) && (
							<span className="text-meta text-warning-foreground dark:text-warning">
								Some have warnings.
							</span>
						)}
						<div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={link.isPending}
								onClick={() => link.mutate({ folder: entry.folder, linked: !entry.linked })}
							>
								{pending && <Spinner data-icon="inline-start" />}
								{entry.linked ? "Unlink" : "Link"}
							</Button>
						</div>
					</div>
				);
			})}
		</ListGroup>
	);
}
