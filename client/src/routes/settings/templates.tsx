import { createFileRoute } from "@tanstack/react-router";

import { templatesQuery } from "@/features/settings/queries";
import { scopeOfProject } from "@/features/settings/templates/template-kind";
import { SettingsTemplates } from "@/features/settings/templates/templates-page";

export const Route = createFileRoute("/settings/templates")({
	head: () => ({ meta: [{ title: "Templates · Settings" }] }),
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm both lists before the page mounts; each card reports its own failure.
	loader: async ({ context, deps }) => {
		const scope = scopeOfProject(deps.project);
		await Promise.all([
			context.queryClient.query({
				...templatesQuery(deps.project, "prompts", scope),
				staleTime: "static",
			}),
			context.queryClient.query({
				...templatesQuery(deps.project, "themes", scope),
				staleTime: "static",
			}),
		]).catch(() => undefined);
	},
	component: SettingsTemplates,
});
