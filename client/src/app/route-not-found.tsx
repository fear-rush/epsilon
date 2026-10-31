/**
 * An address this build does not serve. Without it the router's own "Not Found"
 * screen replaces the product's language (AGENTS.md, Invariants).
 */
import { Link } from "@tanstack/react-router";
import { FileQuestionIcon } from "lucide-react";

import { StatusView } from "@/components/patterns/status/status-view";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function RouteNotFound() {
	return (
		<StatusView
			icon={FileQuestionIcon}
			title="This page does not exist"
			line="The address names nothing this Epsilon serves. A link from an older build can do it."
			action={
				<Link to="/" className={cn(buttonVariants({ variant: "outline" }))}>
					Back to the app
				</Link>
			}
		/>
	);
}
