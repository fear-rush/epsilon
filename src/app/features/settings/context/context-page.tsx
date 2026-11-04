import { useQuery } from "@tanstack/react-query";

import type { ContextOrigin } from "#protocol/context";
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
import { call } from "@/runtime";

/**
 * Settings → Context: what pi loads for a folder before the model answers.
 *
 * Every row is pi's own answer, not Epsilon's guess: the files it reads, the prompt it
 * sends, the tools it offers and how much of the window the chat holds. The live fields
 * are filled only when a chat is open in this folder; the page says which answer it shows.
 */
const contextQuery = {
	queryKey: ["context", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["context.read"]({ folder: null }), { signal }),
};

const originLabel = {
	extension: "extension",
	home: "home",
	package: "package",
	project: "project",
	"settings-path": "settings path",
} satisfies Record<ContextOrigin, string>;

export function SettingsContext() {
	const context = useQuery(contextQuery);

	if (context.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Context" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading what pi loads…" />
				</div>
			</Pane>
		);
	}

	if (context.error !== null) {
		const view = errorView(context.error);
		return (
			<Pane className="flex-1">
				<PaneBar title="Context" />
				<StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />
			</Pane>
		);
	}

	const view = context.data;

	return (
		<Pane className="flex-1">
			<PaneBar title="Context" meta={view.live ? "live chat open" : undefined} />
			<PaneBody page>
				{view.problems.map((problem) => (
					<Notice
						key={`${problem.kind}:${problem.path ?? problem.message}`}
						tone="warning"
						title={`${problem.kind}: ${problem.message}`}
					/>
				))}

				<Section
					title="System prompt"
					description={
						view.live
							? `pi's prompt exactly as the model receives it${view.liveSessionId === undefined ? "" : ` (${view.liveSessionId})`}.`
							: "The files pi would use. The text arrives when a chat is open in this folder."
					}
				>
					<Row title="Source" description="Where pi's prompt comes from.">
						<Badge variant="outline">{view.systemPrompt.source}</Badge>
					</Row>
					{view.systemPrompt.replacePath !== undefined && (
						<Row title="Replaces the prompt" description={view.systemPrompt.replacePath} />
					)}
					{view.systemPrompt.appendPaths.map((path) => (
						<Row key={path} title="Appends to the prompt" description={path} />
					))}
					{view.systemPrompt.text !== undefined && (
						<Row title="Prompt sent to the model" stacked>
							<pre className="max-h-72 w-full overflow-auto rounded-lg border bg-card p-3 text-code break-words whitespace-pre-wrap text-muted-foreground">
								{view.systemPrompt.text}
							</pre>
						</Row>
					)}
				</Section>

				{view.contextUsage !== undefined && (
					<Section
						title="Context window"
						description="How much of the model's window this chat holds."
					>
						<Row
							title="Used"
							description={`${view.contextUsage.tokens ?? "?"} of ${view.contextUsage.contextWindow} tokens`}
						>
							<Badge variant="outline">
								{view.contextUsage.percent === null ? "unknown" : `${view.contextUsage.percent}%`}
							</Badge>
						</Row>
					</Section>
				)}

				<Section
					title="Context files"
					description="Every AGENTS.md or CLAUDE.md pi applies, in its order."
				>
					{view.contextFiles.length === 0 ? (
						<Row title="No context file" description="pi sends none for this folder." />
					) : (
						view.contextFiles.map((file) => (
							<Row key={file.path} title={file.path} description={file.directory}>
								<Badge variant="outline">{file.order}</Badge>
							</Row>
						))
					)}
				</Section>

				{view.tools !== undefined && (
					<Section
						title="Tools"
						description="Every tool pi offers, and the ones this chat made active."
					>
						{view.tools.all.map((tool) => (
							<Row
								key={tool.name}
								title={tool.name}
								description={
									tool.namespace === undefined
										? tool.description
										: `${tool.namespace} · ${tool.description}`
								}
							>
								{view.tools?.active.includes(tool.name) === true ? (
									<Badge variant="secondary">active</Badge>
								) : (
									<Badge variant="outline">inactive</Badge>
								)}
							</Row>
						))}
					</Section>
				)}

				<Section title="Skills" description="Skill documents pi would load for this folder.">
					{view.skills.length === 0 ? (
						<Row title="No skill" />
					) : (
						view.skills.map((skill) => (
							<Row key={skill.filePath} title={skill.name} description={skill.description}>
								<Badge variant="outline">{skill.scope}</Badge>
								{skill.status === "active" ? null : <Badge variant="warning">{skill.status}</Badge>}
							</Row>
						))
					)}
				</Section>

				<Section title="Prompt templates" description="The prompt files a slash command can reach.">
					{view.prompts.length === 0 ? (
						<Row title="No prompt template" />
					) : (
						view.prompts.map((prompt) => (
							<Row key={prompt.path} title={prompt.name} description={prompt.description}>
								<Badge variant="outline">{originLabel[prompt.origin]}</Badge>
								{prompt.enabled ? null : <Badge variant="warning">off</Badge>}
							</Row>
						))
					)}
				</Section>

				<Section title="Extensions" description="The files pi binds, and what they reported.">
					{view.extensions.length === 0 ? (
						<Row title="No extension" />
					) : (
						view.extensions.map((extension) => (
							<Row
								key={extension.path}
								title={extension.name}
								description={
									extension.errors.length + extension.warnings.length === 0
										? extension.path
										: [...extension.errors, ...extension.warnings].join(" · ")
								}
							>
								<Badge variant="outline">{originLabel[extension.origin]}</Badge>
								{extension.enabled ? null : <Badge variant="warning">off</Badge>}
							</Row>
						))
					)}
				</Section>

				<Section
					title="Packages"
					description="What each declared package contributes, counted by pi."
				>
					{view.packages.length === 0 ? (
						<Row title="No package" />
					) : (
						view.packages.map((entry) => (
							<Row
								key={`${entry.scope}:${entry.source}`}
								title={entry.source}
								description={`${entry.resources.extensions} extensions · ${entry.resources.skills} skills · ${entry.resources.prompts} prompts · ${entry.resources.themes} themes`}
							>
								<Badge variant="outline">{entry.scope}</Badge>
							</Row>
						))
					)}
				</Section>
			</PaneBody>
		</Pane>
	);
}
