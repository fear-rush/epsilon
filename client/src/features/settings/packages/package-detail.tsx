import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileQuestionIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { removePackage } from "@/api/endpoints";
import type { PackageView } from "@/api/types";
import { DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import {
	usePackageResources,
	useSettings,
	useSettingsProject,
	useSettingsRefresh,
} from "@/features/settings/queries";
import { PackageProvides } from "./package-provides";

const SCOPE_LABEL = { user: "Global", project: "Project" } as const;

/** One declared package: where it is declared and installed, and what it provides. */
export function PackageDetail({ scope, source }: { scope: PackageView["scope"]; source: string }) {
	const navigate = useNavigate();
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const resources = usePackageResources(source, scope);
	const [removing, setRemoving] = useState(false);
	const remove = useMutation({
		mutationFn: () => removePackage(project, source, scope),
		onSuccess: () => {
			setRemoving(false);
			refresh();
			void navigate({ to: "/settings/packages", search: (previous) => previous });
		},
	});

	const entry = settings.data?.packages.find(
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
				<StatusView {...errorView(settings.error)} />
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
			}
		>
			<Section title="Package">
				<Row title="Source">{source}</Row>
				<Row title="Scope">{SCOPE_LABEL[entry.scope]}</Row>
				{entry.installedPath !== undefined && <Row title="Install path">{entry.installedPath}</Row>}
			</Section>
			{resources.isPending ? (
				<LoadingState label="Reading what it provides…" />
			) : resources.error !== null ? (
				<StatusView {...errorView(resources.error)} />
			) : (
				<PackageProvides resources={resources.data} />
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
