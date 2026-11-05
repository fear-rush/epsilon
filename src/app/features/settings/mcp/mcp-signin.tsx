import { useMutation } from "@tanstack/react-query";
/**
 * pi's three MCP commands from the server page. Each one is the line a typed
 * `/mcp …` becomes, run in the live chat of this folder, because the connection
 * pi signs in to belongs to an engine: a sign-in opens a browser on the machine
 * running Epsilon, and its prompts and its result appear in that chat. So the card
 * says which chat it went to and links there instead of pretending this page owns
 * the flow.
 */
import { Link } from "@tanstack/react-router";

import { Section } from "@/components/patterns/section/section";
import { toneText } from "@/components/patterns/status/status-tone";
import { Button } from "@/components/ui/button";
import { useSettingsProject } from "@/features/settings/queries";
import { cn } from "@/lib/cn";

import { runMcpCommand } from "./commands.ts";
type McpCommandInput = { readonly action: "login" | "logout" | "reconnect"; readonly name: string };
import type { McpServerEntryDetail } from "./mcp-detail";

type Action = McpCommandInput["action"];

const LABELS: Record<Action, string> = {
	login: "Sign in",
	logout: "Sign out",
	reconnect: "Reconnect",
};

/** The commands this server can take, by pi's own eligibility rules. */
const actionsOf = (input: {
	detail: McpServerEntryDetail;
	/** A live engine reported it, which is what `reconnect` acts on. */
	live: boolean;
}): Action[] => {
	// pi offers OAuth to an HTTP server that sends no Authorization header of its own.
	const oauth =
		input.detail.url !== undefined &&
		input.detail.authProvider === undefined &&
		!input.detail.headerKeys.some((key) => key.toLowerCase() === "authorization");
	if (!oauth) return input.live ? ["reconnect"] : [];
	return [
		"login",
		...(input.detail.credentialsStored ? (["logout"] as const) : []),
		...(input.live ? (["reconnect"] as const) : []),
	];
};

export function McpSignIn({
	detail,
	enabled,
	live,
}: {
	detail: McpServerEntryDetail;
	/** Whether pi is asked to connect it at all. */
	enabled: boolean;
	/** Whether a live engine reported it. */
	live: boolean;
}) {
	const project = useSettingsProject();
	const command = useMutation({
		mutationFn: (input: McpCommandInput) => runMcpCommand(project, input),
	});
	const actions = actionsOf({ detail, live });
	return (
		<Section title="Sign-in and reconnect">
			<p className="text-meta text-muted-foreground">
				These run <code>/mcp</code> in the live chat of this folder. A sign-in opens your browser on
				the machine running this dashboard, and the rest happens in that chat.
			</p>
			{actions.length === 0 ? (
				<p className="text-meta text-muted-foreground">
					Nothing to run yet: no live chat has reported this server.
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					{actions.map((action) => (
						<Button
							key={action}
							size="sm"
							variant="outline"
							disabled={!enabled || command.isPending}
							onClick={() => command.mutate({ action, name: detail.name })}
						>
							{LABELS[action]}
						</Button>
					))}
				</div>
			)}
			{enabled ? undefined : (
				<p className="text-meta text-muted-foreground">
					The server is off in this file, so pi has nothing to connect.
				</p>
			)}
			{command.data === undefined ? undefined : (
				<p className="text-meta text-muted-foreground">
					Ran{" "}
					<code>
						/mcp {command.variables.action} {detail.name}
					</code>
					.{" "}
					<Link
						to="/sessions/$sessionId"
						params={{ sessionId: command.data.sessionId }}
						className="underline underline-offset-4"
					>
						Open the chat
					</Link>
				</p>
			)}
			{command.error === null ? undefined : (
				<p className={cn("text-meta", toneText("danger"))}>{command.error.message}</p>
			)}
		</Section>
	);
}
