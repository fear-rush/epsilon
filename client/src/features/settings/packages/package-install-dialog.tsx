import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { installPackage } from "@/api/endpoints";
import type { PackageView } from "@/api/types";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";

const FORM = "package-install-form";

/** Installs through pi's manager into the tab's scope, and closes when it is done. */
export function PackageInstallDialog({
	open,
	scope,
	onOpenChange,
}: {
	open: boolean;
	scope: PackageView["scope"];
	onOpenChange: (open: boolean) => void;
}) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [source, setSource] = useState("");
	const install = useMutation({
		mutationFn: (next: string) => installPackage(project, next, scope),
		onSuccess: () => {
			setSource("");
			refresh();
			onOpenChange(false);
		},
	});

	return (
		<DialogFrame
			open={open}
			onOpenChange={(next) => {
				if (!next) install.reset();
				onOpenChange(next);
			}}
			size="sm"
			title="Install package"
			footer={
				<>
					<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" form={FORM} disabled={install.isPending || source.trim() === ""}>
						{install.isPending && <Spinner data-icon="inline-start" />}
						Install
					</Button>
				</>
			}
		>
			<form
				id={FORM}
				onSubmit={(event) => {
					event.preventDefault();
					install.mutate(source.trim());
				}}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="package-source">Source</FieldLabel>
						<Input
							id="package-source"
							required
							placeholder="npm:@scope/package"
							value={source}
							onChange={(event) => setSource(event.target.value)}
						/>
						<FieldDescription>npm:name, git:host/repo, or a path</FieldDescription>
					</Field>
					{install.error !== null && <Notice tone="error">{install.error.message}</Notice>}
				</FieldGroup>
			</form>
		</DialogFrame>
	);
}
