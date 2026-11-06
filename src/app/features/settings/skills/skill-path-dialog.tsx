import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { DialogFrame } from "@/components/patterns/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useSettingsProject, useSettingsRefresh } from "../queries.ts";
import { addSkillPath } from "./api.ts";

const FORM = "skill-path-form";

/**
 * Adds a folder, or one `.md` file, to the scope's `skills` setting. The server
 * checks that it exists and holds what pi reads, so a refusal is shown here instead
 * of writing an entry pi would skip. The entry is stored as an absolute path.
 */
export function SkillPathDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [path, setPath] = useState("");
	const add = useMutation({
		mutationFn: (next: string) => addSkillPath(project, next),
		onSuccess: () => {
			setPath("");
			refresh();
			onOpenChange(false);
		},
	});

	return (
		<DialogFrame
			open={open}
			onOpenChange={(next) => {
				if (!next) add.reset();
				onOpenChange(next);
			}}
			size="sm"
			body="content"
			title="Add a skill path"
			footer={
				<>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form={FORM} disabled={add.isPending || path.trim() === ""}>
						{add.isPending && <Spinner data-icon="inline-start" />}
						Add
					</Button>
				</>
			}
		>
			<form
				id={FORM}
				onSubmit={(event) => {
					event.preventDefault();
					add.mutate(path.trim());
				}}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="skill-path">Folder or file</FieldLabel>
						<Input
							id="skill-path"
							required
							placeholder="~/shared-skills"
							value={path}
							onChange={(event) => setPath(event.target.value)}
						/>
						<FieldDescription>A folder of skills, or one SKILL.md or .md file</FieldDescription>
					</Field>
					{add.error !== null && <Notice error={add.error} />}
				</FieldGroup>
			</form>
		</DialogFrame>
	);
}
