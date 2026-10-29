/**
 * Packages are installed by pi's own manager and declared in its settings, so a
 * terminal `pi` in this deployment sees the same list.
 */
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { PackageView, SettingsSnapshot } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { installPackage, removePackage } from "@/lib/api";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from "./settings-section";
import { useSettingsRefresh } from "./settings-refresh";

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
								.join(" · ")}
						>
							<Badge variant="outline">{entry.scope}</Badge>
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

			<AlertDialog
				open={pendingDelete !== undefined}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {pendingDelete?.source}?</AlertDialogTitle>
						<AlertDialogDescription>
							The package is no longer declared, and its tools, skills and prompts stop loading.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{remove.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{remove.error.message}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (pendingDelete !== undefined) remove.mutate(pendingDelete.source);
							}}
						>
							{remove.isPending && <Spinner data-icon="inline-start" />}
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsPage>
	);
}
