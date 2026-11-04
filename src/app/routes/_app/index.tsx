import { createFileRoute } from "@tanstack/react-router";

import { NewChat } from "@/features/conversation/new-chat";

export const Route = createFileRoute("/_app/")({
	head: () => ({ meta: [{ title: "New chat · Epsilon" }] }),
	component: NewChat,
});
