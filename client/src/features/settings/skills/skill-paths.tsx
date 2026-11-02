import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { removeSkillPath } from "@/api/endpoints";
import { ListGroup } from "@/components/patterns/list/list-group";
import { Notice } from "@/components/patterns/status/notice";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";
import { SkillPathDialog } from "./skill-path-dialog";

/**
 * The source paths this scope's `skills` setting adds, as written there. A path is
 * removed with every entry that names it, so a `-path` switch cannot outlive its
 * source. The foreign-folder buttons write the same setting.
 */
export function SkillPaths({ paths }: { paths: readonly string[] }) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [adding, setAdding] = useState(false);
	const remove = useMutation({
		mutationFn: (path: string) => removeSkillPath(project, path),
		onSuccess: () => refresh(),
	});

	return (
		<ListGroup title="Skill paths">
			{remove.error !== null && <Notice tone="error">{remove.error.message}</Notice>}
			{paths.length === 0 ? (
				<span className="text-meta text-muted-foreground">
					No path added. pi still reads its own skills folders.
				</span>
			) : (
				paths.map((path) => (
					<div key={path} className="flex min-w-0 items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-meta text-muted-foreground" title={path}>
							{path}
						</span>
						<Tip label="Remove path">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove ${path}`}
								disabled={remove.isPending}
								onClick={() => {
									remove.reset();
									remove.mutate(path);
								}}
							>
								<Trash2Icon />
							</Button>
						</Tip>
					</div>
				))
			)}
			<div>
				<Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
					<PlusIcon />
					Add path
				</Button>
			</div>
			<SkillPathDialog open={adding} onOpenChange={setAdding} />
		</ListGroup>
	);
}
