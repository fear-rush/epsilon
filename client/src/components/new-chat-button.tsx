import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

export function NewChatButton() {
	return (
		<Button variant="secondary" nativeButton={false} render={<Link to="/" />}>
			<PlusIcon data-icon="inline-start" />
			New Chat
		</Button>
	);
}
