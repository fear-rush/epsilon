import { Section } from "@/components/patterns/section/section";
import { SkillBodyField, type BodyReferences } from "./skill-body-field";

/** The Instructions card: the markdown editor with its toolbar, and nothing under it. */
export function SkillInstructions({
	value,
	onChange,
	files,
	references,
}: {
	value: string;
	/** Omitted for a skill Epsilon does not edit. */
	onChange: ((value: string) => void) | undefined;
	files?: readonly string[];
	references?: BodyReferences;
}) {
	return (
		<Section title="Instructions">
			<div className="pad-row">
				<SkillBodyField
					id="skill-instructions"
					value={value}
					onChange={onChange}
					files={files}
					references={references}
				/>
			</div>
		</Section>
	);
}
