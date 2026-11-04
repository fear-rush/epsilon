import { Markdown } from "@/components/editor/markdown";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";

import { useSkillDocument } from "../queries.ts";
import { SKILLS_BACK } from "./skill-modes.ts";
import { SkillReader } from "./skill-page.tsx";

/**
 * A skill pi loads but Epsilon does not write: a package's, an extension's or one of
 * pi's configured paths. What pi knows is shown, and where to edit it is said plainly.
 */
export function SkillViewer({ path }: { path: string }) {
	const query = useSkillDocument(path);
	return (
		<SkillReader query={query} title={query.data?.name}>
			{(doc) => (
				<DetailPage back={SKILLS_BACK} title={doc.name}>
					<div className="grid gap-section">
						<Notice tone="info">
							pi loads this skill from a place Epsilon does not edit. Change it where it lives; the
							four editable roots are the agent home, ~/.agents/skills and the project&apos;s
							.pi/skills and .agents/skills.
						</Notice>
						{doc.parseError !== undefined && (
							<Notice tone="danger" title="The frontmatter does not parse">
								{doc.parseError}
							</Notice>
						)}
						<Section title="Skill">
							<Row title="File">{doc.filePath}</Row>
							<Row title="Description">{doc.description === "" ? "None" : doc.description}</Row>
							<Row title="Model invocation">
								{doc.modelInvocation ? "May load on its own" : "Only on request"}
							</Row>
						</Section>
						{doc.bodyWarnings.map((warning) => (
							<Notice key={warning} tone="warning" title="pi passes this through as text">
								{warning}
							</Notice>
						))}
						{doc.fields.length > 0 && (
							<Section description="pi ignores these." title="Other frontmatter">
								{doc.fields.map((field) => (
									<Row key={field.key} title={field.key} description={field.value}>
										<Badge variant="outline">{field.owner}</Badge>
									</Row>
								))}
							</Section>
						)}
						{doc.body !== "" && (
							<Section title="Instructions">
								<div className="p-3">
									<Markdown>{doc.body}</Markdown>
								</div>
							</Section>
						)}
					</div>
				</DetailPage>
			)}
		</SkillReader>
	);
}
