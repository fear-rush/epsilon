import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, MessageSquarePlusIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";

import type { ProjectStatus, ProjectTrustAction } from "#protocol/settings/projects";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectStatusQuery } from "@/core/queries";
import { call } from "@/core/runtime";
import { sessionsQuery } from "@/features/sessions";

import { FolderPicker } from "./folder-picker.tsx";

/**
 * Settings → Projects: the folders chats run in, and pi's trust decision for each.
 *
 * The list is derived from the chats on disk, so it never invents a project and never
 * forgets one that has a conversation. The picker opens a folder Epsilon has not used
 * yet; its trust is asked in the chat's own gate, not here.
 */
export function SettingsProjects() {
	const sessions = useQuery(sessionsQuery);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [picking, setPicking] = useState(false);

	const folders = [
		...new Set((sessions.data?.sessions ?? []).map((session) => session.cwd)),
	].toSorted((left, right) => left.localeCompare(right));
	const statuses = useQueries({
		queries: folders.map((folder) => projectStatusQuery(folder)),
	});
	const projects = statuses.flatMap((status) => (status.data === undefined ? [] : [status.data]));

	const trust = useMutation({
		mutationFn: (input: { action: ProjectTrustAction; path: string }) =>
			call((client) => client["settings.projects.setTrust"](input)),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "projects"] }),
	});

	const start = (path: string): void => {
		void navigate({ search: { place: path }, to: "/" });
	};

	if (sessions.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Projects" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading the chats on disk…" />
				</div>
			</Pane>
		);
	}

	if (sessions.error !== null) {
		const view = errorView(sessions.error);
		return (
			<StatusView
				action={
					<Button variant="outline" onClick={() => void sessions.refetch()}>
						Try again
					</Button>
				}
				icon={view.icon}
				line={view.line}
				title={view.title}
				tone={view.tone}
			/>
		);
	}

	return (
		<Pane className="flex-1">
			<PaneBar
				actions={
					<Button size="sm" variant="outline" onClick={() => setPicking(true)}>
						<FolderPlusIcon /> Open folder
					</Button>
				}
				title="Projects"
			/>
			<PaneBody page>
				<Section
					description="Every folder a chat has run in, with pi's trust decision for it. Epsilon starts nothing in an untrusted folder until you answer."
					title="Folders you chat in"
				>
					{projects.length === 0 ? (
						<Row description="Open one above to start a chat in it." title="No projects yet" />
					) : (
						projects.map((project) => (
							<ProjectRow
								key={project.path}
								pending={trust.isPending}
								project={project}
								onNewChat={start}
								onTrust={(action) => trust.mutate({ action, path: project.path })}
							/>
						))
					)}
				</Section>
				{trust.error !== null && (
					<Notice tone="danger" title="The trust decision was not saved">
						{errorView(trust.error).line}
					</Notice>
				)}
			</PaneBody>
			<FolderPicker
				open={picking}
				onClose={() => setPicking(false)}
				onPick={(path) => {
					setPicking(false);
					start(path);
				}}
			/>
		</Pane>
	);
}

function ProjectRow({
	project,
	pending,
	onNewChat,
	onTrust,
}: {
	project: ProjectStatus;
	pending: boolean;
	onNewChat: (path: string) => void;
	onTrust: (action: ProjectTrustAction) => void;
}) {
	return (
		<Row description={project.path} title={project.name}>
			<Badge variant={project.trusted ? "secondary" : "outline"}>
				{project.trusted ? "Trusted" : "Not trusted"}
			</Badge>
			{project.hasProjectResources && <Badge variant="outline">Own pi resources</Badge>}
			{(project.settingsProblems ?? []).length > 0 && (
				<Badge variant="warning">Settings problem</Badge>
			)}
			<Button size="sm" variant="outline" onClick={() => onNewChat(project.path)}>
				<MessageSquarePlusIcon /> New chat
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`Trust actions for ${project.name}`}
					className="rounded-md p-1 text-muted-foreground hover:bg-muted"
				>
					<MoreHorizontalIcon className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{project.trusted ? (
						<DropdownMenuItem disabled={pending} onClick={() => onTrust("untrust")}>
							Do not trust
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem disabled={pending} onClick={() => onTrust("trust")}>
							Trust
						</DropdownMenuItem>
					)}
					{project.parent !== null && (
						<DropdownMenuItem disabled={pending} onClick={() => onTrust("trust-parent")}>
							Trust the parent folder
						</DropdownMenuItem>
					)}
					{project.decidedHere && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem disabled={pending} onClick={() => onTrust("forget")}>
								Forget the decision
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</Row>
	);
}
