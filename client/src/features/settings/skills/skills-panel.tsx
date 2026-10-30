/**
 * The left side of the skills editor: the user skills in the agent home's skills
 * folder, and the add route.
 */
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import { MasterListPanel } from "@/features/settings/kit/master-list-panel";
import { useSettings } from "@/features/settings/queries";

export function SkillsPanel({
	selectedName,
	editing,
}: {
	selectedName: string | undefined;
	editing: boolean;
}) {
	const settings = useSettings();
	const [query, setQuery] = useState("");

	const skills = settings.data?.skills ?? [];
	const needle = query.trim().toLowerCase();
	const visible = skills.filter((skill) =>
		`${skill.name} ${skill.description}`.toLowerCase().includes(needle),
	);

	return (
		<MasterListPanel
			title="Skills"
			count={skills.length}
			editing={editing}
			error={settings.data?.error}
			query={query}
			onQueryChange={setQuery}
			searchLabel="Search skills"
			pending={settings.isPending}
			pendingLabel="Reading skills…"
			empty={
				visible.length === 0
					? skills.length === 0
						? "No user skill yet."
						: "Nothing matches."
					: undefined
			}
			footer={
				<Link
					to="/settings/skills/new"
					className={cn(buttonVariants({ variant: "outline" }), "w-full")}
				>
					<PlusIcon />
					Add skill
				</Link>
			}
		>
			{visible.map((skill) => (
				<Link
					key={skill.name}
					to="/settings/skills/$name"
					params={{ name: skill.name }}
					className={cn(
						"block rounded-xl px-2 py-2 transition-colors",
						selectedName === skill.name ? "bg-muted" : "hover:bg-muted/60",
					)}
				>
					<span className="block truncate text-sm font-medium">{skill.name}</span>
					<span className="block truncate text-xs text-muted-foreground">{skill.description}</span>
				</Link>
			))}
		</MasterListPanel>
	);
}
