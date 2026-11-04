import { Link } from "@tanstack/react-router";

import type { PackageResources, PackageView } from "#protocol/settings/packages";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { usePackageResourceToggle } from "./package-resource";

const GROUPS = [
	{ key: "extensions", title: "Extensions" },
	{ key: "skills", title: "Skills" },
	{ key: "prompts", title: "Prompts" },
	{ key: "themes", title: "Themes" },
] as const;

/**
 * What a package provides, by kind, with a switch on each entry. A switch writes
 * that package's own filter, so turning one off hides it from the agent without
 * removing the package. An empty kind is hidden; none at all says so.
 */
export function PackageProvides({
	resources,
	source,
	scope,
}: {
	resources: PackageResources;
	source: string;
	scope: PackageView["scope"];
}) {
	const toggle = usePackageResourceToggle(source, scope);
	const groups = GROUPS.filter((group) => resources[group.key].length > 0);
	return (
		<section className="grid gap-card">
			<h2 className="text-section">Provides</h2>
			{toggle.error !== null && (
				<Notice tone="danger" title="The switch was not saved">
					{toggle.error.message}
				</Notice>
			)}
			{groups.length === 0 ? (
				<p className="text-meta text-muted-foreground">Nothing found</p>
			) : (
				groups.map((group) => (
					<div key={group.key} className="grid gap-2">
						<h3 className="text-meta font-medium text-muted-foreground">{group.title}</h3>
						<Section>
							{resources[group.key].map((entry) => (
								<Row
									key={entry.path}
									title={entry.name}
									description={entry.enabled ? undefined : "Disabled"}
								>
									{group.key === "skills" && (
										<Link
											to="/settings/skills"
											search={(previous) => previous}
											className={buttonVariants({ variant: "ghost", size: "sm" })}
										>
											Open
										</Link>
									)}
									<Switch
										size="sm"
										checked={entry.enabled}
										disabled={toggle.isPending}
										aria-label={`${entry.enabled ? "Turn off" : "Turn on"} ${entry.name}`}
										onCheckedChange={(checked) =>
											toggle.mutate({ type: group.key, path: entry.path, enabled: checked })
										}
									/>
								</Row>
							))}
						</Section>
					</div>
				))
			)}
		</section>
	);
}
