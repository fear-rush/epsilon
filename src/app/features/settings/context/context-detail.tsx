/**
 * The right side of the Context page: one section of pi's answer, read-only, with a
 * badge saying whether it came from an open chat or from the files alone.
 */
import { useQuery } from "@tanstack/react-query";
import { FileQuestionIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { ContextView } from "#protocol/settings/context";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";

import { contextQuery, useSettingsProject } from "../queries.ts";
import {
	ContextExtensions,
	ContextFiles,
	ContextPackages,
	ContextPrompts,
	ContextSkills,
	ContextSystemPrompt,
	ContextTools,
} from "./context-pages.tsx";
import { contextSection } from "./context-sections.ts";
import type { ContextSectionId } from "./context-sections.ts";

/** One body per section, each with the same `view` prop. */
const BODIES = {
	extensions: ContextExtensions,
	files: ContextFiles,
	packages: ContextPackages,
	prompt: ContextSystemPrompt,
	prompts: ContextPrompts,
	skills: ContextSkills,
	tools: ContextTools,
} satisfies Record<ContextSectionId, ComponentType<{ view: ContextView }>>;

export function ContextSectionPage({ id }: { id: string }) {
	const project = useSettingsProject();
	const context = useQuery(contextQuery(project));
	const section = contextSection(id);
	const back = { to: "/settings/context", label: "Context" } as const;
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
				<StatusView error={context.error} />
			</DetailPage>
		);
	}
	const view = context.data;
	const Body = BODIES[section.id];
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
			<Body view={view} />
		</DetailPage>
	);
}
