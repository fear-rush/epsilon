import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";
import { listedSkillQuery, settingsQuery, skillQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/skills/$name")({
	loaderDeps: ({ search }) => ({
		project: search.project,
		root: search.root,
		path: search.path,
	}),
	// Warm the page's reads before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, params, deps }) => {
		const snapshot = context.queryClient.query({
			...settingsQuery(deps.project),
			staleTime: "static",
		});
		// A skill Epsilon edits is read by root and name; any other only by its file.
		const detail =
			deps.path === undefined
				? context.queryClient.query({
						...skillQuery(deps.project, deps.root ?? "home", params.name),
						staleTime: "static",
					})
				: context.queryClient.query({
						...listedSkillQuery(deps.project, deps.path),
						staleTime: "static",
					});
		await Promise.all([snapshot, detail]).catch(() => undefined);
	},
	component: function SkillPage() {
		const { name } = Route.useParams();
		const { root, path } = Route.useSearch();
		return <SkillEditor key={`${path ?? root}\0${name}`} name={name} root={root} path={path} />;
	},
	head: ({ params }) => ({ meta: [{ title: `${params.name} · Skills · Settings` }] }),
});
