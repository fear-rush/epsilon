import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpCircleIcon, FileQuestionIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import type { PackageView } from "#protocol/settings/packages";
import { DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import {
	usePackageResources,
	usePackageUpdates,
	usePackageUpdatesRefresh,
	useSettings,
	useSettingsProject,
	useSettingsRefresh,
} from "../queries.ts";
import { removePackage, updatePackage } from "./api.ts";
import { scopeLabel } from "./package-kind.ts";
import { PackageProvides } from "./package-provides";

/** One declared package: where it is declared and installed, and what it provides. */
export function PackageDetail({ scope, source }: { scope: PackageView["scope"]; source: string }) {
	const navigate = useNavigate();
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const resources = usePackageResources(source, scope);
	const updates = usePackageUpdates();
	const updatesRefresh = usePackageUpdatesRefresh();
	const [removing, setRemoving] = useState(false);
	const update = useMutation({
		mutationFn: () => updatePackage(project, source, scope),
		onSuccess: () => {
			refresh();
			updatesRefresh();
		},
	});
	const available =
		updates.data?.updates.some((entry) => entry.source === source && entry.scope === scope) ===
		true;
	const remove = useMutation({
		mutationFn: () => removePackage(project, source, scope),
		onSuccess: () => {
			setRemoving(false);
			refresh();
			updatesRefresh();
			void navigate({ to: "/settings/packages", search: (previous) => previous });
		},
	});

	const entry = settings.data?.packages.packages.find(
		(candidate) => candidate.source === source && candidate.scope === scope,
	);
	const back = { to: "/settings/packages", label: "Packages" } as const;

	if (settings.isPending) {
		return (
			<DetailPage title={source} back={back}>
				<LoadingState label="Reading package…" />
			</DetailPage>
		);
	}
	if (settings.error !== null) {
		return (
			<DetailPage title={source} back={back}>
				<StatusView error={settings.error} />
			</DetailPage>
		);
	}
	if (entry === undefined) {
		return (
			<DetailPage title={source} back={back}>
				<StatusView icon={FileQuestionIcon} title="Not found" />
			</DetailPage>
		);
	}

	return (
		<DetailPage
			title={source}
			back={back}
			actions={
				<>
					{available && (
						<Tip label="Update package">
							<Button
								variant="outline"
								size="icon-sm"
								aria-label={update.isPending ? "Updating package" : "Update package"}
								disabled={update.isPending}
								onClick={() => {
									update.reset();
									update.mutate();
								}}
							>
								{update.isPending ? <Spinner /> : <ArrowUpCircleIcon />}
							</Button>
						</Tip>
					)}
					<Tip label="Remove package">
						<Button
							variant="destructive"
							size="icon-sm"
							aria-label="Remove package"
							onClick={() => {
								remove.reset();
								setRemoving(true);
							}}
						>
							<Trash2Icon />
						</Button>
					</Tip>
				</>
			}
		>
			<Section title="Package">
				<Row title="Source">{source}</Row>
				<Row title="Scope">{scopeLabel(entry)}</Row>
				{entry.installedPath !== undefined && <Row title="Install path">{entry.installedPath}</Row>}
			</Section>
			{update.error !== null && <Notice error={update.error} title="The update failed" />}
			{resources.isPending ? (
				<LoadingState label="Reading what it provides…" />
			) : resources.error === null ? (
				<PackageProvides resources={resources.data} source={source} scope={scope} />
			) : (
				<StatusView error={resources.error} />
			)}
			<DeleteDialog
				open={removing}
				title={`Remove ${source}?`}
				description="Its extensions, skills, prompts and themes stop loading."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setRemoving}
				onConfirm={() => remove.mutate()}
			/>
		</DetailPage>
	);
}
