import { Link, useMatchRoute, useSearch } from "@tanstack/react-router";
import { PlusIcon, UploadIcon } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { cn } from "@/lib/cn";
import type { SkillView } from "@/api/types";
import { useSettings, useSettingsProject } from "@/features/settings/queries";
import { ForeignSkills } from "./foreign-skills";
import { ImportSkillsDialog } from "./import/import-dialog";
import { groupSkills } from "./skill-groups";
import { skillKey, skillSearch } from "./skill-search";

/**
 * The left side of the skills editor: the Global or project tab, the skills pi
 * loads grouped by where they live, the skills other agents keep that pi could
 * read, and the add and import actions. A project tab lists only the project's
 * own skills. Add writes to the agent home on Global and to the project's
 * `.agents/skills` on a project tab.
 */

/** A skill pi does not load as it stands: off, shadowed, refused, or untrusted. */
const isQuiet = (skill: SkillView): boolean =>
	skill.status === "disabled" ||
	skill.status === "shadowed" ||
	skill.status === "invalid" ||
	skill.status === "untrusted";

function SkillsPanel({ selected }: { selected: string | undefined }) {
	const settings = useSettings();
	const [query, setQuery] = useState("");
	const [importing, setImporting] = useState(false);
	const project = settings.data?.project ?? null;
	const inProject = useSettingsProject() !== undefined;

	const skills = settings.data?.skills ?? [];
	const needle = query.trim().toLowerCase();
	const visible = skills.filter((skill) =>
		`${skill.name} ${skill.description}`.toLowerCase().includes(needle),
	);
	// A project tab lists only the project's own skills, other agents' folders included.
	const foreign = (settings.data?.foreignSkills ?? []).filter(
		(skill) =>
			(!inProject || skill.scope === "project") &&
			`${skill.name} ${skill.description}`.toLowerCase().includes(needle),
	);
	const groups = groupSkills(
		visible,
		inProject && project !== null ? { name: project.name, path: project.path } : undefined,
	);
	const shown = groups.reduce((total, group) => total + group.skills.length, 0);
	const nothing = shown === 0 && foreign.length === 0;

	return (
		<ListPane
			title="Skills"
			count={shown}
			scope="/settings/skills"
			notices={
				settings.data?.error === undefined ? undefined : (
					<Notice tone="error">{settings.data.error}</Notice>
				)
			}
			query={query}
			onQueryChange={setQuery}
			searchLabel="Search skills"
			pending={settings.isPending}
			pendingLabel="Reading skills…"
			empty={
				nothing
					? needle !== "" && skills.length > 0
						? "Nothing matches."
						: inProject
							? "No skills in this project."
							: "No skill yet."
					: undefined
			}
			footer={
				<>
					<Button type="button" variant="outline" onClick={() => setImporting(true)}>
						<UploadIcon />
						Import
					</Button>
					<Link
						to="/settings/skills/new"
						search={{ root: inProject ? "project-agents" : "home" }}
						className={cn(buttonVariants({ variant: "outline" }))}
					>
						<PlusIcon />
						Add skill
					</Link>
					<ImportSkillsDialog open={importing} onOpenChange={setImporting} />
				</>
			}
		>
			<div
				key={project?.path ?? "global"}
				className={cn(
					"grid min-w-0 grid-cols-[minmax(0,1fr)]",
					inProject ? "animate-enter-right" : "animate-enter-left",
				)}
			>
				{groups.map((group) => (
					<ListGroup key={group.id} title={group.title}>
						{group.skills.map((skill) => (
							<ListItem
								key={skillKey(skill)}
								name={skill.name}
								description={skill.description === "" ? "No description" : skill.description}
								selected={selected === skillKey(skill)}
								dimmed={isQuiet(skill)}
								link={{
									to: "/settings/skills/$name",
									params: { name: skill.name },
									search: skillSearch(skill),
								}}
							/>
						))}
					</ListGroup>
				))}
				<ForeignSkills skills={foreign} />
			</div>
		</ListPane>
	);
}

/** The route owns which skill is selected; the panel only draws it. */
export function SkillsLayout() {
	const matchRoute = useMatchRoute();
	const search = useSearch({ strict: false });
	const matched = matchRoute({ to: "/settings/skills/$name" });
	const selected =
		matched === false ? undefined : (search.path ?? `${search.root ?? "home"}\0${matched.name}`);
	const adding = matchRoute({ to: "/settings/skills/new" }) !== false;
	return (
		<MasterDetail
			editing={selected !== undefined || adding}
			list={<SkillsPanel selected={selected} />}
		/>
	);
}
