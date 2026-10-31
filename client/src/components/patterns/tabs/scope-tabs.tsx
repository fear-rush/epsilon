/**
 * Global or one project, at the top of a resource section: the same split pi
 * makes between the agent home and a project's `.pi`. The tab decides what Add
 * writes. The project lives in the Settings URL; switching returns to the
 * section's list, because an open entry belongs to the scope it was opened in.
 */
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, FolderOpenIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderDialog, useRecentProjects } from "@/features/projects";
import { useSettings, useSettingsProject } from "@/features/settings/queries";

export type ScopedSection = "/settings/mcp" | "/settings/skills" | "/settings/packages";

/** A Select value that cannot be a path, for the item that opens the folder dialog. */
const OPEN_FOLDER = "\0open";

/** Where the scope lives (the Settings URL) and how to change it, for the tabs and the picker. */
function useScopeSwitch(section: ScopedSection) {
	const navigate = useNavigate();
	const project = useSettingsProject();
	const settings = useSettings();
	const recent = useRecentProjects().filter((entry) => entry.trusted);
	const [opening, setOpening] = useState(false);
	const name = settings.data?.project?.name ?? project?.split("/").at(-1);

	const show = (next: string | undefined) =>
		void navigate({ to: section, search: (previous) => ({ ...previous, project: next }) });

	/** The project tab needs a folder: the last one shown, else the newest, else ask. */
	const toProject = () => {
		const first = recent[0]?.path;
		if (first === undefined) setOpening(true);
		else show(first);
	};

	const choices = [
		...recent.map((entry) => ({ value: entry.path, label: entry.name })),
		...(project !== undefined && !recent.some((entry) => entry.path === project)
			? [{ value: project, label: name ?? project }]
			: []),
	];

	const dialog = (
		<FolderDialog
			open={opening}
			onOpenChange={setOpening}
			title="Choose a project"
			action="Choose"
			recent={recent}
			onPick={(path) => show(path)}
		/>
	);
	return { project, show, toProject, choices, setOpening, dialog };
}

/** Global or Project, full width in a pane's band. */
export function ScopeTabs({ section }: { section: ScopedSection }) {
	const scope = useScopeSwitch(section);
	return (
		<>
			<Tabs
				className="w-full"
				value={scope.project === undefined ? "global" : "project"}
				onValueChange={(value) => (value === "global" ? scope.show(undefined) : scope.toProject())}
			>
				<TabsList className="w-full">
					<TabsTrigger value="global">
						<GlobeIcon />
						Global
					</TabsTrigger>
					<TabsTrigger value="project">
						<FolderIcon />
						Project
					</TabsTrigger>
				</TabsList>
			</Tabs>
			{scope.dialog}
		</>
	);
}

/** Which project a Project tab shows, as its own row under the band. Nothing on Global. */
export function ProjectPicker({ section }: { section: ScopedSection }) {
	const scope = useScopeSwitch(section);
	if (scope.project === undefined) return null;
	return (
		<div className="shrink-0 animate-enter-drop px-pane pt-pane">
			<Select
				items={[...scope.choices, { value: OPEN_FOLDER, label: "Open another folder…" }]}
				value={scope.project}
				onValueChange={(next: string | null) => {
					if (next === OPEN_FOLDER) scope.setOpening(true);
					else if (next !== null) scope.show(next);
				}}
			>
				<SelectTrigger aria-label="Project" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{scope.choices.map((choice) => (
							<SelectItem key={choice.value} value={choice.value}>
								{choice.label}
							</SelectItem>
						))}
					</SelectGroup>
					<SelectSeparator />
					<SelectGroup>
						<SelectItem value={OPEN_FOLDER}>
							<FolderOpenIcon />
							Open another folder…
						</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			{scope.dialog}
		</div>
	);
}
