/**
 * The page of a skill Epsilon does not edit (a package, a settings path, a folder
 * above the project, a nested skill). The Form tab is the editable page's cards
 * with the controls disabled, the Raw tab shows its files read-only, and the
 * footer says why there is no editor.
 */
import { FileQuestionIcon } from "lucide-react";
import { useState } from "react";

import type { SkillView } from "@/api/types";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { StatusView } from "@/components/patterns/status/status-view";
import { ModeTabs } from "@/components/patterns/tabs/mode-tabs";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { useListedSkill, useSettings } from "@/features/settings/queries";
import { SkillCard } from "./skill-card";
import type { SkillDraft } from "./skill-draft";
import { SkillInstructions } from "./skill-instructions";
import { LoadedSwitch } from "./skill-loaded-switch";
import { SkillNotices } from "./skill-notices";
import { SKILL_MODES, SKILLS_BACK, type SkillTab } from "./skill-modes";
import { SkillReader, SkillStatusPage } from "./skill-page";
import { SkillRaw } from "./skill-raw";
import { useSkillLinks } from "./skill-references";
import { readOnlyReason, useSkillToggle } from "./skill-status";
import { SkillUnreadable } from "./skill-unreadable";

const noChange = () => undefined;

export function SkillViewer({ path }: { path: string }) {
	const settings = useSettings();
	if (settings.isPending) {
		return (
			<SkillStatusPage>
				<div className="flex h-full items-center justify-center">
					<LoadingState label="Reading the skill…" />
				</div>
			</SkillStatusPage>
		);
	}
	const skill = settings.data?.skills.find((entry) => entry.filePath === path);
	if (skill === undefined) {
		return (
			<SkillStatusPage>
				<StatusView
					icon={FileQuestionIcon}
					title="Skill not found"
					line={`No skill is loaded from ${path} any more.`}
				/>
			</SkillStatusPage>
		);
	}
	return <LoadedSkill key={path} skill={skill} />;
}

function LoadedSkill({ skill }: { skill: SkillView }) {
	const query = useListedSkill(skill.filePath);
	const links = useSkillLinks();
	const toggle = useSkillToggle();
	const [tab, setTab] = useState<SkillTab>("form");
	const [rawPath, setRawPath] = useState("SKILL.md");
	return (
		<SkillReader query={query} title={skill.name}>
			{(file) => {
				const draft: SkillDraft = {
					name: skill.name,
					description: file.description,
					modelInvocation: skill.modelInvocation,
					body: file.body,
				};
				return (
					<DetailPage
						title={skill.name}
						back={SKILLS_BACK}
						bodyKey={tab}
						actions={<LoadedSwitch skill={skill} toggle={toggle} />}
						tabs={<ModeTabs items={SKILL_MODES} value={tab} onValueChange={setTab} />}
						footerStatus={`Read-only: ${readOnlyReason(skill)}.`}
						fill={tab === "raw"}
					>
						<SkillNotices skill={skill} body={file.body} errors={[toggle.error]} />
						{tab === "raw" ? (
							<SkillRaw
								source={{ kind: "listed", filePath: skill.filePath }}
								path={rawPath}
								onPathChange={setRawPath}
								onDirtyChange={noChange}
								onSaved={noChange}
							/>
						) : file.parseError !== undefined ? (
							<SkillUnreadable error={file.parseError} raw={file.raw ?? ""} />
						) : (
							<>
								<SkillCard readOnly creating={false} errors={{}} draft={draft} update={noChange} />
								<SkillInstructions
									value={file.body}
									onChange={undefined}
									references={{
										skillExists: links.exists,
										openSkill: links.open,
										openFile: (target) => {
											setRawPath(target);
											setTab("raw");
										},
									}}
								/>
							</>
						)}
					</DetailPage>
				);
			}}
		</SkillReader>
	);
}
