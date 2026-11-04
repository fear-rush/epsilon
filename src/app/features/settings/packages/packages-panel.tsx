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

import { usePackageUpdates, useSettings, useSettingsProject } from "../queries.ts";
import { PackageInstallDialog } from "./package-install-dialog";
import { packageLine, relationLabel, scopeOf } from "./package-kind";

function PackagesList({ selected }: { selected: string | undefined }) {
	const settings = useSettings();
	const updates = usePackageUpdates();
	const project = useSettingsProject();
	const scope = scopeOf(project);
	const [query, setQuery] = useState("");
	const [installing, setInstalling] = useState(false);

	// The read is already scoped: a project tab also carries the global entries it inherits.
	const rows = settings.data?.packages.packages ?? [];
	const outdated = new Set(
		(updates.data?.updates ?? []).map((entry) => `${entry.scope}\0${entry.source}`),
	);
	const needle = query.trim().toLowerCase();
	const visible = rows.filter((entry) =>
		`${entry.source} ${packageLine(entry)}`.toLowerCase().includes(needle),
	);

	return (
		<>
			<ListPane
				title="Packages"
				count={rows.length}
				scope="/settings/packages"
				query={query}
				onQueryChange={setQuery}
				searchLabel="Search packages"
				pending={settings.isPending}
				pendingLabel="Reading packages…"
				error={settings.error}
				notices={
					updates.error === null ? undefined : (
						<Notice error={updates.error} title="Could not check for updates" />
					)
				}
				empty={
					visible.length === 0
						? rows.length === 0
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
					{visible.map((entry) => {
						const relation = relationLabel(entry);
						const update = outdated.has(`${entry.scope}\0${entry.source}`);
						return (
							<ListItem
								key={`${entry.scope}\0${entry.source}`}
								name={entry.source}
								description={packageLine(entry)}
								selected={selected === entry.source}
								trailing={
									relation !== undefined || update ? (
										<span className="flex items-center gap-1">
											{relation !== undefined && <Badge variant="outline">{relation}</Badge>}
											{update && <Badge variant="info">Update</Badge>}
										</span>
									) : undefined
								}
								link={{
									to: "/settings/packages/$scope/$source",
									params: { scope: entry.scope, source: entry.source },
									search: true,
								}}
							/>
						);
					})}
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
