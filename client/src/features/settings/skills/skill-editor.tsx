/**
 * The detail pane of one skill. An editable skill (`root` + `name` in the URL)
 * opens its page; any other (`path`) shows what pi knows about it, read-only,
 * and why Epsilon does not edit it. A new skill has only a `root`.
 */
import { useState } from "react";

import type { SkillRoot } from "@/api/types";
import { useSettings, useSkill } from "@/features/settings/queries";
import { SkillForm } from "./skill-form";
import type { SkillTab } from "./skill-modes";
import { SkillReader } from "./skill-page";
import { SkillViewer } from "./skill-viewer";

export function SkillEditor({
	name,
	root = "home",
	path,
}: {
	name?: string;
	root?: SkillRoot;
	path?: string;
}) {
	if (path !== undefined) return <SkillViewer path={path} />;
	if (name === undefined) return <SkillForm root={root} detail={undefined} view={undefined} />;
	return <EditableSkill root={root} name={name} />;
}

function EditableSkill({ root, name }: { root: SkillRoot; name: string }) {
	const query = useSkill(root, name);
	const settings = useSettings();
	const view = settings.data?.skills.find((skill) => skill.root === root && skill.name === name);
	// The tab and the open raw file live here, above the form, so a reload keeps them.
	const [tab, setTab] = useState<SkillTab>("form");
	const [rawPath, setRawPath] = useState("SKILL.md");
	const [version, setVersion] = useState(0);
	const reload = () => {
		void query.refetch().then(() => setVersion((current) => current + 1));
	};
	return (
		<SkillReader query={query} title={name}>
			{(detail) => (
				<SkillForm
					key={`${detail.filePath}\0${version}`}
					root={root}
					detail={detail}
					view={view}
					page={{ tab, setTab, rawPath, setRawPath, reload }}
				/>
			)}
		</SkillReader>
	);
}
