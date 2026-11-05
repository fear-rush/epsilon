import { Link, useMatchRoute, useSearch } from "@tanstack/react-router";
import { PlusIcon, UploadIcon } from "lucide-react";
import { useState } from "react";

import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Button, buttonVariants } from "@/components/ui/button";

import { useSettings, useSettingsProject } from "../queries.ts";
import { ForeignSkills } from "./foreign-skills.tsx";
import { ImportSkillsDialog } from "./import/import-dialog.tsx";
import { groupSkills } from "./skill-groups.ts";
import { SkillPaths } from "./skill-paths.tsx";
import { skillKey, skillSearch } from "./skill-search.ts";

/** A skill pi does not load as it stands: off, shadowed, refused or untrusted. */
const isQuiet = (status: string): boolean =>
	status === "disabled" || status === "shadowed" || status === "invalid" || status === "untrusted";

function SkillsPanel({ selected }: { selected: string | undefined }) {
	const settings = useSettings();
	const project = useSettingsProject();
	const current = useSearch({ from: "/settings/skills" });
	const inProject = project !== undefined;
	const [query, setQuery] = useState("");
	const [importing, setImporting] = useState(false);
	const skills = settings.data?.skills.skills ?? [];
	const needle = query.trim().toLowerCase();
	const visible = skills.filter((skill) =>
		`${skill.name} ${skill.description}`.toLowerCase().includes(needle),
	);
	// A project tab lists only the project's own skills, other agents' folders included.
	const foreign = (settings.data?.skills.foreignSkills ?? []).filter(
		(skill) =>
			(!inProject || skill.scope === "project") &&
			`${skill.name} ${skill.description}`.toLowerCase().includes(needle),
	);
	const fallback = settings.data?.project;
	const groups = groupSkills(
		visible,
		inProject && fallback !== null && fallback !== undefined
			? { name: fallback.name, path: fallback.path }
			: undefined,
	);
	const shown = groups.reduce((total, group) => total + group.skills.length, 0);
	const nothing = shown === 0 && foreign.length === 0;

	return (
		<ListPane
			title="Skills"
			count={shown}
			scope="/settings/skills"
			empty={
				nothing
					? needle !== "" && skills.length > 0
						? "Nothing matches."
						: inProject
							? "No skills in this project."
							: "No skill yet."
					: undefined
			}
			error={settings.error}
			footer={
				<>
					<Button type="button" variant="outline" onClick={() => setImporting(true)}>
						<UploadIcon />
						Import
					</Button>
					<Link to="/settings/skills/new" search className={buttonVariants({ variant: "outline" })}>
						<PlusIcon />
						Add skill
					</Link>
					<ImportSkillsDialog open={importing} onOpenChange={setImporting} />
				</>
			}
			onQueryChange={setQuery}
			pending={settings.isPending}
			pendingLabel="Reading skills…"
			query={query}
			searchLabel="Search skills"
		>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
				{groups.map((group) => (
					<ListGroup key={group.id} title={group.title}>
						{group.skills.map((skill) => (
							<ListItem
								key={skillKey(skill)}
								name={skill.name}
								description={skill.description === "" ? "No description" : skill.description}
								selected={selected === skillKey(skill)}
								dimmed={isQuiet(skill.status)}
								link={{
									params: { name: skill.folder },
									search: skillSearch(skill, current),
									to: "/settings/skills/$name",
								}}
							/>
						))}
					</ListGroup>
				))}
				<SkillPaths paths={settings.data?.skills.paths ?? []} />
				<ForeignSkills skills={foreign} />
			</div>
		</ListPane>
	);
}

/** The route owns which skill is open; the list only draws it. */
export function SkillsLayout() {
	const matchRoute = useMatchRoute();
	const path = useSearch({ from: "/settings/skills", select: (search) => search.path });
	const root = useSearch({ from: "/settings/skills", select: (search) => search.root });
	const matched = matchRoute({ to: "/settings/skills/$name" });
	const selected = matched === false ? undefined : (path ?? `${root ?? "home"}\0${matched.name}`);
	const adding = matchRoute({ to: "/settings/skills/new" }) !== false;
	return (
		<MasterDetail
			editing={selected !== undefined || adding}
			list={<SkillsPanel selected={selected} />}
		/>
	);
}
