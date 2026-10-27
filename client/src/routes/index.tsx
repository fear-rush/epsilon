import { Chat } from "@/components/chat";
import { createFileRoute } from "@tanstack/react-router";
import { CHAT_MODELS } from "shared";

export const Route = createFileRoute("/")({
	component: function Index() {
		return <Chat models={CHAT_MODELS} />;
	},
});
