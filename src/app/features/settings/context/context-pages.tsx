/**
 * The body of each Context section: pi's answer drawn read-only. Nothing here writes
 * a file. Each row names the path it came from, and a section says what only a live
 * engine knows when no chat is open.
 */
import { WrenchIcon } from "lucide-react";

import type {
	ContextExtension,
	ContextPackage,
	ContextProblem,
	ContextPrompt,
	ContextView,
} from "#protocol/settings/context";
import type { SkillView } from "#protocol/settings/skills";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";

import { counted } from "./context-sections.ts";
/** pi's diagnostics for one section, in the operator's words. */
const problemsOf = (view: ContextView, kind: ContextProblem["kind"]): ContextProblem[] =>
	view.problems.filter((problem) => problem.kind === kind);

function Problems({ problems }: { problems: ContextProblem[] }) {
	return (
		<>
			{problems.map((problem) => (
				<Notice
					key={`${problem.path ?? ""}\0${problem.message}`}
					tone="warning"
					{...(problem.path === undefined ? {} : { title: problem.path })}
				>
					{problem.message}
				</Notice>
			))}
		</>
	);
}

/** A file's own name, which is what a reader scans for in a list of paths. */
const nameOfPath = (path: string): string =>
	path.split("/").findLast((part) => part !== "") ?? path;

export function ContextFiles({ view }: { view: ContextView }) {
	if (view.contextFiles.length === 0) {
		return (
			<Section title="Context files">
				<Row
					title="No context file"
					description="pi reads one AGENTS.md or CLAUDE.md per folder."
				/>
			</Section>
		);
	}
	return (
		<Section title="Context files" description="Files pi loads before the model answers.">
			{view.contextFiles.map((file) => (
				<Row key={file.path} title={nameOfPath(file.path)} description={file.path}>
					<Badge variant="outline">{file.order}</Badge>
				</Row>
			))}
		</Section>
	);
}

export function ContextSystemPrompt({ view }: { view: ContextView }) {
	const source =
		view.systemPrompt.source === "project"
			? "The project's .pi/SYSTEM.md"
			: view.systemPrompt.source === "agent"
				? "The agent home's SYSTEM.md"
				: "pi's built-in prompt";
	return (
		<>
			<Section title="Source">
				<Row title="Replacing prompt" description={view.systemPrompt.replacePath ?? source}>
					<Badge variant="secondary">{view.systemPrompt.source}</Badge>
				</Row>
				<Row
					title="Appending prompt"
					description={
						view.systemPrompt.appendPaths.length === 0
							? "None"
							: view.systemPrompt.appendPaths.join("\n")
					}
				/>
			</Section>
			{view.systemPrompt.text === undefined ? (
				<Notice tone="info">
					The exact prompt appears once a chat is open in this folder, because pi builds it inside
					the engine.
				</Notice>
			) : (
				<Section title="What the model receives">
					<div className="pad-row">
						<pre className="max-h-96 overflow-auto font-mono text-meta break-words whitespace-pre-wrap">
							{view.systemPrompt.text}
						</pre>
					</div>
				</Section>
			)}
		</>
	);
}

/** The one badge that says why pi will not use a skill as its file says. */
const skillTone = (
	status: SkillView["status"],
): "secondary" | "warning" | "destructive" | "outline" =>
	status === "invalid"
		? "destructive"
		: status === "shadowed"
			? "warning"
			: status === "active"
				? "secondary"
				: "outline";

export function ContextSkills({ view }: { view: ContextView }) {
	if (view.skills.length === 0) {
		return (
			<Section title="Skills">
				<Row title="No skill" description="No SKILL.md found." />
			</Section>
		);
	}
	return (
		<>
			<Section title="Skills" description="Skills pi found.">
				{view.skills.map((skill) => (
					<Row
						key={skill.filePath}
						title={skill.name}
						description={`${skill.description === "" ? (skill.message ?? "No description") : skill.description} · ${skill.filePath}`}
					>
						<Badge variant={skillTone(skill.status)}>{skill.status}</Badge>
						<Badge variant="outline">{skill.origin}</Badge>
					</Row>
				))}
			</Section>
			<Problems problems={problemsOf(view, "skill")} />
		</>
	);
}

/** One prompt template, as a row that names where it lives and who may use it. */
const promptRow = (prompt: ContextPrompt) => (
	<Row key={prompt.path} title={`/${prompt.name}`} description={prompt.description || prompt.path}>
		{prompt.enabled ? undefined : <Badge variant="outline">off</Badge>}
		<Badge variant="secondary">{prompt.origin}</Badge>
	</Row>
);

export function ContextPrompts({ view }: { view: ContextView }) {
	return (
		<>
			<Section title="Prompt templates" description="Type a name to expand one.">
				{view.prompts.length === 0 ? (
					<Row title="No template" description="No prompt template here." />
				) : (
					view.prompts.map(promptRow)
				)}
			</Section>
			<Problems problems={problemsOf(view, "prompt")} />
		</>
	);
}

/** One extension, as a row that names its file and where pi found it. */
const extensionRow = (extension: ContextExtension) => (
	<Row key={extension.path} title={extension.name} description={extension.path}>
		{extension.enabled ? undefined : <Badge variant="outline">off</Badge>}
		<Badge variant="secondary">{extension.origin}</Badge>
	</Row>
);

export function ContextExtensions({ view }: { view: ContextView }) {
	return (
		<>
			<Section
				title="Extensions"
				description={
					view.live
						? "What pi loaded for the open chat."
						: "What settings and packages declare. pi's built-ins join the list once a chat opens."
				}
			>
				{view.extensions.length === 0 ? (
					<Row title="No extension" description="Nothing adds one." />
				) : (
					view.extensions.map(extensionRow)
				)}
			</Section>
			<Problems problems={problemsOf(view, "extension")} />
		</>
	);
}

/** What one package contributes, in the kinds that are not empty. */
const packageLine = (entry: ContextPackage): string => {
	const parts = [
		counted(entry.resources.extensions, "extension", "extensions"),
		counted(entry.resources.skills, "skill", "skills"),
		counted(entry.resources.prompts, "template", "templates"),
		counted(entry.resources.themes, "theme", "themes"),
	];
	return parts.every((part) => part.startsWith("0 ")) ? "Nothing resolved" : parts.join(", ");
};

export function ContextPackages({ view }: { view: ContextView }) {
	return (
		<Section title="Packages" description="Where pi finds extensions, skills and prompts.">
			{view.packages.length === 0 ? (
				<Row title="No package" description="No settings file lists one." />
			) : (
				view.packages.map((entry) => (
					<Row
						key={`${entry.scope}\0${entry.source}`}
						title={entry.source}
						description={packageLine(entry)}
					>
						<Badge variant="secondary">{entry.scope}</Badge>
					</Row>
				))
			)}
		</Section>
	);
}

export function ContextTools({ view }: { view: ContextView }) {
	const tools = view.tools;
	if (tools === undefined) {
		return (
			<StatusView
				icon={WrenchIcon}
				title="No chat open"
				line="Open a chat in this folder to see its tools."
			/>
		);
	}
	const active = new Set(tools.active);
	const inactive = tools.all.filter((tool) => !active.has(tool.name));
	return (
		<>
			<Section title="Active tools" description="Tools the model can call in the open chat.">
				{tools.all
					.filter((tool) => active.has(tool.name))
					.map((tool) => (
						<Row key={tool.name} title={tool.name} description={tool.description}>
							{tool.namespace === undefined ? undefined : (
								<Badge variant="secondary">{tool.namespace}</Badge>
							)}
						</Row>
					))}
			</Section>
			<Section title="Offered but inactive" description="Available, but turned off.">
				{inactive.length === 0 ? (
					<Row title="Nothing inactive" description="Every tool is on." />
				) : (
					inactive.map((tool) => (
						<Row key={tool.name} title={tool.name} description={tool.description}>
							{tool.namespace === undefined ? undefined : (
								<Badge variant="outline">{tool.namespace}</Badge>
							)}
						</Row>
					))
				)}
			</Section>
		</>
	);
}
