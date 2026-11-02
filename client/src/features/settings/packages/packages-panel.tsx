import { useMatchRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePackageUpdates, useSettings, useSettingsProject } from "@/features/settings/queries";
import { packageLine, scopeOf } from "./package-kind";
import { PackageInstallDialog } from "./package-install-dialog";

function PackagesList({ selected }: { selected: string | undefined }) {
	const settings = useSettings();
	const updates = usePackageUpdates();
	const project = useSettingsProject();
	const scope = scopeOf(project);
	const [query, setQuery] = useState("");
	const [installing, setInstalling] = useState(false);

	// A project tab lists only the project's own packages.
	const own = (settings.data?.packages ?? []).filter((entry) => entry.scope === scope);
	const outdated = new Set((updates.data ?? []).map((entry) => `${entry.scope}\0${entry.source}`));
	const needle = query.trim().toLowerCase();
	const visible = own.filter((entry) =>
		`${entry.source} ${packageLine(entry)}`.toLowerCase().includes(needle),
	);

	return (
		<>
			<ListPane
				title="Packages"
				count={own.length}
				scope="/settings/packages"
				query={query}
				onQueryChange={setQuery}
				searchLabel="Search packages"
				pending={settings.isPending}
				pendingLabel="Reading packages…"
				error={settings.error}
				notices={
					updates.error !== null ? (
						<Notice tone="error" title="Could not check for updates">
							{updates.error.message}
						</Notice>
					) : undefined
				}
				empty={
					visible.length === 0
						? own.length === 0
							? "No packages installed"
							: "Nothing matches"
						: undefined
				}
				footer={
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => setInstalling(true)}
					>
						<PlusIcon />
						Install package
					</Button>
				}
			>
				<ListGroup>
					{visible.map((entry) => (
						<ListItem
							key={entry.source}
							name={entry.source}
							description={packageLine(entry)}
							selected={selected === entry.source}
							trailing={
								outdated.has(`${entry.scope}\0${entry.source}`) ? (
									<Badge variant="info">Update</Badge>
								) : undefined
							}
							link={{
								to: "/settings/packages/$scope/$source",
								params: { scope: entry.scope, source: entry.source },
								search: true,
							}}
						/>
					))}
				</ListGroup>
			</ListPane>
			<PackageInstallDialog open={installing} scope={scope} onOpenChange={setInstalling} />
		</>
	);
}

/** The route owns which package is open; the list only draws it. */
export function PackagesLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/packages/$scope/$source" });
	const selected = matched === false ? undefined : matched.source;
	return (
		<MasterDetail editing={selected !== undefined} list={<PackagesList selected={selected} />} />
	);
}
