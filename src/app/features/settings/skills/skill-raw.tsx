import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { SkillRoot } from "#protocol/settings/skills";
import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";

import { useSettingsProject, useSettingsRefresh, useSkillRaw } from "../queries.ts";
import { writeSkillRaw } from "./api.ts";

/** One skill's `SKILL.md` as text: the frontmatter the Form tab does not manage included. */
export function SkillRaw({ name, root }: { name: string; root: SkillRoot }) {
	const query = useSkillRaw(root, name);
	const refresh = useSettingsRefresh();
	const project = useSettingsProject();
	const [text, setText] = useState<string | undefined>(undefined);
	const value = text ?? query.data?.text ?? "";
	const save = useMutation({
		mutationFn: (next: string) => writeSkillRaw(project, root, name, next),
		onSuccess: () => {
			setText(undefined);
			refresh();
			void query.refetch();
		},
	});

	if (query.isPending) return <Notice tone="info">Reading the file…</Notice>;
	if (query.error !== null) return <Notice tone="error">{query.error.message}</Notice>;

	return (
		<div className="grid gap-3">
			<CodeEditor
				className="h-96"
				label="SKILL.md"
				language="markdown"
				value={value}
				onChange={setText}
			/>
			{save.error !== null && (
				<Notice tone="error" title="The file was not saved">
					{save.error.message}
				</Notice>
			)}
			<div className="flex justify-end">
				<Button
					type="button"
					disabled={text === undefined || save.isPending}
					onClick={() => save.mutate(value)}
				>
					{save.isPending ? "Saving…" : "Save file"}
				</Button>
			</div>
		</div>
	);
}
