/**
 * One user skill, written as `<agent home>/skills/<name>/SKILL.md`. The
 * frontmatter the form edits is `description`; the body is the instructions pi
 * loads when a task matches. The form holds a draft so nothing is written until
 * Save; a new skill becomes a real route after its first save.
 */
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { skillDescriptionSchema, skillNameSchema } from "shared";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CancelDialog } from "@/features/settings/kit/dialogs";
import { DeleteDialog } from "@/features/settings/kit/dialogs";
import { DetailLoader } from "@/features/settings/kit/detail-loader";
import { FormFooter, FormPage } from "@/features/settings/kit/form-page";
import { UnsavedChangesBlock } from "@/features/settings/kit/dialogs";
import { useDraftForm } from "@/features/settings/kit/use-draft-form";
import { useSettings } from "@/features/settings/queries";
import { useSettingsRefresh } from "@/features/settings/queries";
import { deleteSkill, saveSkill } from "@/api/endpoints";

import { useSkill } from "@/features/settings/queries";
import type { SkillInput } from "@/api/types";

type SkillField = keyof SkillInput;

/** The rules the form checks before it sends; the server applies the same ones. */
const skillFormSchema = z.object({ name: skillNameSchema, description: skillDescriptionSchema });

const skillFields: readonly SkillField[] = ["name", "description", "body"];

export function SkillEditor({ name }: { name?: string }) {
	const query = useSkill(name);
	return (
		<DetailLoader
			query={query}
			reading={name !== undefined}
			noun="skill"
			backTo="/settings/skills"
			backLabel="skills"
		>
			{(detail) => <SkillForm key={detail?.name} detail={detail} />}
		</DetailLoader>
	);
}

function SkillForm({ detail }: { detail: SkillInput | undefined }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const form = useDraftForm<SkillInput, SkillField>({
		initial: () => detail ?? { name: "", description: "", body: "" },
		fields: skillFields,
	});
	const { draft, update, errors } = form;

	const taken = new Set((settings.data?.skills ?? []).map((skill) => skill.name));
	if (detail !== undefined) taken.delete(detail.name);

	const save = useMutation({
		mutationFn: saveSkill,
		onSuccess: () => {
			form.markSaved();
			refresh();
			if (detail === undefined) {
				form.allowLeave();
				void navigate({
					to: "/settings/skills/$name",
					params: { name: draft.name },
					replace: true,
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: deleteSkill,
		onSuccess: () => {
			form.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/skills" }).then(refresh);
		},
	});

	const submit = () => {
		const found: Partial<Record<SkillField, string>> = {};
		const parsed = skillFormSchema.safeParse(draft);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (key === "name") {
					found.name ??= draft.name === "" ? "A skill needs a name." : issue.message;
				} else if (key === "description") {
					found.description ??= "Say what the skill does and when to use it.";
				}
			}
		}
		if (found.name === undefined && taken.has(draft.name)) {
			found.name = `A skill named ${draft.name} already exists. Pick another name.`;
		}
		form.setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(draft);
	};

	return (
		<FormPage
			backTo="/settings/skills"
			backLabel="Skills"
			title={detail?.name ?? "New skill"}
			description="The description decides when the agent considers this skill."
			footer={
				<FormFooter
					dirty={form.dirty}
					isNew={detail === undefined}
					saving={save.isPending}
					onSave={submit}
					onCancel={() => form.setCancelOpen(true)}
					onDelete={() => {
						remove.reset();
						form.setDeleteOpen(true);
					}}
				/>
			}
		>
			<FieldGroup>
				<Field data-invalid={errors.name !== undefined}>
					<FieldLabel htmlFor="skill-name">Name</FieldLabel>
					<Input
						id="skill-name"
						value={draft.name}
						disabled={detail !== undefined}
						aria-invalid={errors.name !== undefined}
						onChange={(event) => update({ name: event.target.value })}
					/>
					<FieldDescription>The directory under the agent home's skills folder</FieldDescription>
					{errors.name !== undefined && <FieldError>{errors.name}</FieldError>}
				</Field>
				<Field data-invalid={errors.description !== undefined}>
					<FieldLabel htmlFor="skill-description">Description</FieldLabel>
					<Input
						id="skill-description"
						value={draft.description}
						aria-invalid={errors.description !== undefined}
						onChange={(event) => update({ description: event.target.value })}
					/>
					<FieldDescription>What it does and when the agent should use it</FieldDescription>
					{errors.description !== undefined && <FieldError>{errors.description}</FieldError>}
				</Field>
				<Field>
					<FieldLabel htmlFor="skill-instructions">Instructions</FieldLabel>
					<Textarea
						id="skill-instructions"
						rows={12}
						className="font-mono text-xs"
						value={draft.body}
						onChange={(event) => update({ body: event.target.value })}
					/>
				</Field>
			</FieldGroup>

			{save.error !== null && (
				<Alert variant="destructive">
					<AlertDescription>{save.error.message}</AlertDescription>
				</Alert>
			)}

			{detail === undefined && (
				<CancelDialog
					open={form.cancelOpen}
					title="Cancel this skill?"
					description="Nothing is saved until you press Save. The name, description and instructions you entered will be lost."
					onOpenChange={form.setCancelOpen}
					onDiscard={() => {
						form.allowLeave();
						void navigate({ to: "/settings/skills" });
					}}
				/>
			)}

			<UnsavedChangesBlock blocked={form.blocked} subject="skill" />

			<DeleteDialog
				open={form.deleteOpen}
				title={`Remove ${detail?.name ?? draft.name}?`}
				description="The skill directory and every file in it are deleted."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate(detail.name);
				}}
			/>
		</FormPage>
	);
}
