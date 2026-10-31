import { Link } from "@tanstack/react-router";

import type { PackageResources } from "@/api/types";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { buttonVariants } from "@/components/ui/button";

const GROUPS = [
	{ key: "extensions", title: "Extensions" },
	{ key: "skills", title: "Skills" },
	{ key: "prompts", title: "Prompts" },
	{ key: "themes", title: "Themes" },
] as const;

/** What a package provides, by kind. An empty kind is hidden; none at all says so. */
export function PackageProvides({ resources }: { resources: PackageResources }) {
	const groups = GROUPS.filter((group) => resources[group.key].length > 0);
	if (groups.length === 0) {
		return (
			<section className="grid gap-2">
				<h2 className="text-section">Provides</h2>
				<p className="text-meta text-muted-foreground">Nothing found</p>
			</section>
		);
	}
	return (
		<section className="grid gap-card">
			<h2 className="text-section">Provides</h2>
			{groups.map((group) => (
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
										to="/settings/skills/$name"
										params={{ name: entry.name }}
										search={(previous) => ({
											...previous,
											path: entry.path,
										})}
										className={buttonVariants({ variant: "ghost", size: "sm" })}
									>
										Open
									</Link>
								)}
							</Row>
						))}
					</Section>
				</div>
			))}
		</section>
	);
}
