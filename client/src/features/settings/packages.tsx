import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { installPackage, removePackage } from "@/api/endpoints";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { DeleteDialog } from "@/features/settings/kit/dialogs";
import {
	SettingsBlock,
	SettingsGroup,
	SettingsPage,
	SettingsRow,
} from "@/features/settings/kit/settings-section";
import { useSettingsRefresh } from "@/features/settings/queries";
import type { PackageView, SettingsSnapshot } from "@/api/types";

/**
 * Packages are installed by pi's own manager and declared in its settings, so a
 * terminal `pi` on this machine sees the same list.
 */

export function SettingsPackages({ snapshot }: { snapshot: SettingsSnapshot }) {
	const [source, setSource] = useState("");
	const [pendingDelete, setPendingDelete] = useState<PackageView | undefined>(undefined);
	const refresh = useSettingsRefresh();

	const install = useMutation({
		mutationFn: installPackage,
		onSuccess: () => {
			setSource("");
			refresh();
		},
	});
	const remove = useMutation({
		mutationFn: removePackage,
		onSuccess: () => {
			setPendingDelete(undefined);
			refresh();
		},
	});

	return (
		<SettingsPage title="Packages">
			<SettingsGroup title="Declared">
				{snapshot.packages.length === 0 ? (
					<SettingsRow title="No package declared" description="Install one below." />
				) : (
					snapshot.packages.map((entry) => (
						<SettingsRow
							key={entry.source}
							title={entry.source}
							description={[entry.scope, entry.installedPath]
								.filter((part) => part !== undefined)
								.join(", ")}
						>
							<Badge variant="secondary">{entry.scope}</Badge>
							<Button
								variant="destructive"
								size="icon-sm"
								aria-label={`Remove ${entry.source}`}
								onClick={() => {
									remove.reset();
									setPendingDelete(entry);
								}}
							>
								<Trash2Icon />
							</Button>
						</SettingsRow>
					))
				)}
			</SettingsGroup>

			<SettingsGroup title="Install a package">
				<SettingsBlock>
					<form
						className="grid gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							install.mutate(source);
						}}
					>
						<Field>
							<FieldLabel htmlFor="package-source">Source</FieldLabel>
							<Input
								id="package-source"
								required
								placeholder="npm:@scope/package"
								value={source}
								onChange={(event) => setSource(event.target.value)}
							/>
							<FieldDescription>
								npm:name, git:host/repo, or a path, as `pi install` accepts
							</FieldDescription>
						</Field>
						{install.error !== null && (
							<Alert variant="destructive">
								<AlertDescription>{install.error.message}</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							className="justify-self-end"
							disabled={install.isPending || source.trim() === ""}
						>
							{install.isPending ? <Spinner /> : <PlusIcon />}
							{install.isPending ? "Installing…" : "Install"}
						</Button>
					</form>
				</SettingsBlock>
			</SettingsGroup>

			<DeleteDialog
				open={pendingDelete !== undefined}
				title={`Remove ${pendingDelete?.source ?? ""}?`}
				description="The package is no longer declared, and its tools, skills and prompts stop loading."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
				onConfirm={() => {
					if (pendingDelete !== undefined) remove.mutate(pendingDelete.source);
				}}
			/>
		</SettingsPage>
	);
}
