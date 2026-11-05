/**
 * The detail pane of one skill. An editable skill (`root` + `name` in the URL) opens its
 * page; any other (`path`) shows what pi knows about it, read-only, and why Epsilon does
 * not edit it. A new skill has only a `root`.
 */
import { useState } from "react";

import type { SkillRoot } from "#protocol/settings/skills";

import { useSettings, useSkill } from "../queries.ts";
import { SkillForm } from "./skill-form.tsx";
import { useSkillPage } from "./skill-page-state.ts";
import { SkillReader } from "./skill-page.tsx";
import { SkillViewer } from "./skill-viewer.tsx";

export function SkillEditor({
	name,
	root = "home",
	path,
}: {
	name?: string | undefined;
	root?: SkillRoot | undefined;
	path?: string | undefined;
}) {
	if (path !== undefined) return <SkillViewer path={path} />;
	if (name === undefined) return <SkillForm root={root} detail={undefined} view={undefined} />;
	return <EditableSkill root={root} name={name} />;
}

function EditableSkill({ root, name }: { root: SkillRoot; name: string }) {
	const query = useSkill(root, name);
	const settings = useSettings();
	const view = settings.data?.skills.skills.find(
		(skill) => skill.root === root && skill.folder === name,
	);
	const { tab, rawPath, setTab, setRawPath, openRawFile } = useSkillPage();
	const [version, setVersion] = useState(0);
	const reload = () => {
		void query.refetch().then(() => setVersion((current) => current + 1));
	};
	return (
		<SkillReader query={query} title={view?.name ?? name}>
			{(detail) => (
				<SkillForm
					key={`${detail.filePath}\0${version}`}
					root={root}
					detail={detail}
					view={view}
					page={{ tab, setTab, rawPath, setRawPath, openRawFile, reload }}
				/>
			)}
		</SkillReader>
	);
}
