/**
 * Home is the chat landing. The sidebar's Projects action starts a project chat;
 * a `project` search still names a folder for a bookmark or the Change action.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NewChat } from "@/features/conversation/new-chat";

/** `project` names the folder a new project chat runs in; a chat has none. */
const searchSchema = z.object({ project: z.string().min(1).optional().catch(undefined) });

export const Route = createFileRoute("/_app/")({
	head: () => ({ meta: [{ title: "New chat · Epsilon" }] }),
	validateSearch: searchSchema,
	component: function Home() {
		const { project } = Route.useSearch();
		// A different folder is a different conversation, so the id and engine start over.
		return <NewChat key={project ?? ""} project={project} />;
	},
});
