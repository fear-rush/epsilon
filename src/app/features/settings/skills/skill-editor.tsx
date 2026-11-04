import type { SkillRoot } from "#protocol/config/skills";

import { useSettings, useSkill } from "../queries.ts";
import { SkillForm } from "./skill-form.tsx";
import { SkillReader } from "./skill-page.tsx";
import { SkillViewer } from "./skill-viewer.tsx";

/** An editable skill (`root` + name), a listed one (`path`), or a new one (a `root`). */
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
	if (name === undefined) return <NewSkill root={root} />;
	return <EditableSkill name={name} root={root} />;
}

function NewSkill({ root }: { root: SkillRoot }) {
	return <SkillForm file={undefined} root={root} view={undefined} />;
}

function EditableSkill({ name, root }: { name: string; root: SkillRoot }) {
	const query = useSkill(root, name);
	const settings = useSettings();
	const view = settings.data?.skills.skills.find(
		(skill) => skill.root === root && skill.folder === name,
	);
	return (
		<SkillReader query={query} title={view?.name ?? name}>
			{(file) => <SkillForm file={file} root={root} view={view} />}
		</SkillReader>
	);
}
