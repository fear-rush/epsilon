import { usesSkillTool } from "#domain/skills/references";
import type { SkillView } from "#protocol/settings/skills";
import { Notice } from "@/components/patterns/status/notice";

/**
 * What the page has to say about the skill: pi refused it, skipped it, shadowed
 * it, or it relies on a tool pi lacks; plus any failed action. Nothing when all is well.
 */
export function SkillNotices({
	skill,
	body,
	errors = [],
}: {
	skill: SkillView | undefined;
	/** The instructions, checked for Claude Code's Skill tool. */
	body?: string;
	errors?: readonly (Error | null)[];
}) {
	const warnings = [
		...(skill?.status === "untrusted" ? ["Untrusted project: pi skips its skills."] : []),
		...(skill?.status === "shadowed"
			? [skill.shadowedBy === undefined ? "Shadowed." : `Shadowed by ${skill.shadowedBy}.`]
			: []),
		...(skill?.warnings ?? []),
		...(body !== undefined && usesSkillTool(body)
			? ["Uses Claude Code's Skill tool, which pi doesn't have."]
			: []),
	];
	const problems = skill?.status === "invalid" ? [skill.message ?? "pi refused this skill."] : [];
	const failures = errors.filter((error) => error !== null);
	if (warnings.length === 0 && problems.length === 0 && failures.length === 0) return null;
	return (
		<div className="grid gap-field">
			{problems.map((problem) => (
				<Notice key={problem} tone="danger">
					{problem}
				</Notice>
			))}
			{failures.map((error) => (
				<Notice key={error.message} error={error} />
			))}
			{warnings.map((warning) => (
				<Notice key={warning} tone="warning">
					{warning}
				</Notice>
			))}
		</div>
	);
}
