/**
 * The right side of the Context page: one section of pi's answer, read-only, with a
 * badge saying whether it came from an open chat or from the files alone.
 */
import { useQuery } from "@tanstack/react-query";
import { FileQuestionIcon } from "lucide-react";

import type { ContextView } from "@/api/types";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { contextQuery, useSettingsProject } from "@/features/settings/queries";
import {
	ContextExtensions,
	ContextFiles,
	ContextPackages,
	ContextPrompts,
	ContextSkills,
	ContextSystemPrompt,
	ContextTools,
} from "./context-pages";
import { contextSection } from "./context-sections";
import type { ContextSectionId } from "./context-sections";

function SectionBody({ id, view }: { id: ContextSectionId; view: ContextView }) {
	switch (id) {
		case "files":
			return <ContextFiles view={view} />;
		case "prompt":
			return <ContextSystemPrompt view={view} />;
		case "skills":
			return <ContextSkills view={view} />;
		case "prompts":
			return <ContextPrompts view={view} />;
		case "extensions":
			return <ContextExtensions view={view} />;
		case "packages":
			return <ContextPackages view={view} />;
		case "tools":
			return <ContextTools view={view} />;
	}
}

export function ContextSectionPage({ id }: { id: string }) {
	const project = useSettingsProject();
	const context = useQuery(contextQuery(project));
	const section = contextSection(id);
	const back = { to: "/settings/context", label: "Context", search: true } as const;
	const title = section?.label ?? "Context";

	if (section === undefined) {
		return (
			<DetailPage title={title} back={back}>
				<StatusView icon={FileQuestionIcon} title="No such section" />
			</DetailPage>
		);
	}
	if (context.isPending) {
		return (
			<DetailPage title={title} back={back}>
				<LoadingState label="Reading context…" />
			</DetailPage>
		);
	}
	if (context.error !== null) {
		return (
			<DetailPage title={title} back={back}>
				<StatusView {...errorView(context.error)} />
			</DetailPage>
		);
	}
	const view = context.data;
	return (
		<DetailPage
			title={title}
			back={back}
			actions={
				<Badge variant={view.live ? "info" : "outline"}>
					{view.live ? "From the open chat" : "From files"}
				</Badge>
			}
		>
			<SectionBody id={section.id} view={view} />
		</DetailPage>
	);
}
