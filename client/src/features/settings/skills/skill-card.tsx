/**
 * The Skill card: the name (fixed once written), the description the model
 * decides from, and whether the model may load it on its own.
 */
import { SKILL_DESCRIPTION_MAX } from "shared";

import { cn } from "@/lib/cn";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import type { SkillDraft, SkillErrors } from "./skill-draft";

export function SkillCard({
	draft,
	errors,
	creating,
	readOnly = false,
	update,
}: {
	draft: SkillDraft;
	errors: SkillErrors;
	creating: boolean;
	readOnly?: boolean;
	update: (patch: Partial<SkillDraft>) => void;
}) {
	const left = SKILL_DESCRIPTION_MAX - draft.description.length;
	return (
		<Section title="Skill">
			<FieldStack>
				<Field data-invalid={errors.name !== undefined}>
					<FieldLabel htmlFor="skill-name">Name</FieldLabel>
					<Input
						id="skill-name"
						value={draft.name}
						placeholder="my-skill"
						disabled={!creating}
						aria-invalid={errors.name !== undefined}
						onChange={(event) => update({ name: event.target.value })}
					/>
					<FieldError>{errors.name}</FieldError>
				</Field>
				<Field data-invalid={errors.description !== undefined}>
					<FieldLabel htmlFor="skill-description">Description</FieldLabel>
					<Textarea
						id="skill-description"
						rows={3}
						value={draft.description}
						disabled={readOnly}
						aria-invalid={errors.description !== undefined}
						onChange={(event) => update({ description: event.target.value })}
					/>
					<FieldDescription
						className={cn("text-right tabular-nums", left < 0 && "text-destructive")}
					>
						{draft.description.length}/{SKILL_DESCRIPTION_MAX}
					</FieldDescription>
					<FieldError>{errors.description}</FieldError>
				</Field>
			</FieldStack>
			<Row title="Load automatically">
				<Switch
					aria-label="Load automatically"
					checked={draft.modelInvocation}
					disabled={readOnly}
					onCheckedChange={(modelInvocation) => update({ modelInvocation })}
				/>
			</Row>
		</Section>
	);
}
