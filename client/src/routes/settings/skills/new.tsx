import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";
import { settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/skills/new")({
	head: () => ({ meta: [{ title: "New skill · Settings" }] }),
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's read before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, deps }) => {
		await context.queryClient
			.query({ ...settingsQuery(deps.project), staleTime: "static" })
			.catch(() => undefined);
	},
	component: function NewSkillPage() {
		const { root } = Route.useSearch();
		return <SkillEditor key={root} root={root} />;
	},
});
