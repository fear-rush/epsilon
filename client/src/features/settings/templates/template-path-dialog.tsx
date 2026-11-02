import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { addTemplatePath } from "@/api/endpoints";
import type { TemplatePathInput } from "@/api/types";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";
import { TEMPLATE_KIND } from "./template-kind";

const FORM = "template-path-form";

/**
 * Adds one path to a scope's prompts or themes list. The server checks that the
 * path exists and holds the kind pi loads, so a refusal is shown here instead of
 * writing an entry pi would skip.
 */
export function TemplatePathDialog({
	open,
	onOpenChange,
	kind,
	scope,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kind: TemplatePathInput["kind"];
	scope: TemplatePathInput["scope"];
}) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [path, setPath] = useState("");
	const label = TEMPLATE_KIND[kind];
	const add = useMutation({
		mutationFn: (next: string) => addTemplatePath(project, { kind, scope, path: next }),
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
			title={label.addTitle}
			footer={
				<>
					<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
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
						<FieldLabel htmlFor="template-path">Folder or file</FieldLabel>
						<Input
							id="template-path"
							required
							placeholder={label.placeholder}
							value={path}
							onChange={(event) => setPath(event.target.value)}
						/>
						<FieldDescription>{label.fileHint}</FieldDescription>
					</Field>
					{add.error !== null && <Notice tone="error">{add.error.message}</Notice>}
				</FieldGroup>
			</form>
		</DialogFrame>
	);
}
