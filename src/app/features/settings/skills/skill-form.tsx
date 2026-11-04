import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { SkillFile, SkillInput, SkillRoot, SkillView } from "#protocol/settings/skills";
import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { EnabledSwitch } from "@/components/patterns/enabled-switch";
import { ModeTabs } from "@/components/patterns/mode-tabs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { useDraftForm } from "@/components/patterns/use-draft-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useSettings, useSettingsProject, useSettingsRefresh } from "../queries.ts";
import { removeSkill, saveSkill, setSkillEnabled } from "./api.ts";
import { SKILL_FIELDS, toDraft, toInput, validate } from "./skill-draft.ts";
import type { SkillDraft, SkillField } from "./skill-draft.ts";
import { SKILL_MODES, SKILLS_BACK } from "./skill-modes.ts";
import type { SkillTab } from "./skill-modes.ts";
import { SkillRaw } from "./skill-raw.tsx";

/**
 * One editable skill, written as `<root>/<name>/SKILL.md`. The Form tab edits the
 * frontmatter pi acts on and the body; the Raw tab edits the file as text. Every other
 * frontmatter key is kept as the file has it. A new skill becomes a route after Save.
 */
export function SkillForm({
	file,
	root,
	view,
}: {
	file: SkillFile | undefined;
	root: SkillRoot;
	view: SkillView | undefined;
}) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const project = useSettingsProject();
	const creating = file === undefined;
	const form = useDraftForm<SkillDraft, SkillField>({
		fields: SKILL_FIELDS,
		initial: () => toDraft(file, view?.name),
	});
	const { draft, update, errors } = form;
	const [tab, setTab] = useState<SkillTab>("form");
	const unreadable = file?.parseError !== undefined;

	const taken = new Set(
		(settings.data?.skills.skills ?? [])
			.filter((skill) => skill.root === root)
			.map((skill) => skill.folder),
	);
	const save = useMutation({
		mutationFn: (input: SkillInput) => saveSkill(project, root, file?.name ?? draft.name, input),
		onSuccess: () => {
			form.markSaved();
			refresh();
			if (creating) {
				form.allowLeave();
				void navigate({
					params: { name: draft.name },
					replace: true,
					search: (previous) => ({ project: previous.project, root }),
					to: "/settings/skills/$name",
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: (name: string) => removeSkill(project, root, name),
		onSuccess: () => {
			form.allowLeave();
			void navigate({ search: true, to: "/settings/skills" });
			refresh();
		},
	});
	const toggle = useMutation({
		mutationFn: (enabled: boolean) => setSkillEnabled(project, view?.filePath ?? "", enabled),
		onSuccess: refresh,
	});

	const submit = (): void => {
		const found = validate(draft, creating, taken);
		form.setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(toInput(draft));
	};

	return (
		<DetailPage
			back={SKILLS_BACK}
			title={view?.name ?? (draft.name === "" ? "New skill" : draft.name)}
			tabs={
				unreadable ? undefined : <ModeTabs items={SKILL_MODES} value={tab} onValueChange={setTab} />
			}
			actions={
				view === undefined || view.toggle !== "settings" ? undefined : (
					<EnabledSwitch
						checked={view.status !== "disabled"}
						disabled={toggle.isPending}
						label={view.name}
						onCheckedChange={(enabled) => toggle.mutate(enabled)}
					/>
				)
			}
			footer={
				<>
					{creating ? undefined : (
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								remove.reset();
								form.setDeleteOpen(true);
							}}
						>
							Delete
						</Button>
					)}
					<Button type="button" disabled={save.isPending} onClick={submit}>
						{save.isPending ? "Saving…" : "Save"}
					</Button>
				</>
			}
		>
			<div className="grid gap-section">
				{view?.message !== undefined && <Notice tone="error">{view.message}</Notice>}
				{(view?.warnings ?? []).map((warning) => (
					<Notice key={warning} tone="warning">
						{warning}
					</Notice>
				))}
				{file?.parseError !== undefined && (
					<Notice tone="error" title="The frontmatter does not parse">
						{file.parseError} Only the Raw tab can edit this file.
					</Notice>
				)}
				{(file?.bodyWarnings ?? []).map((warning) => (
					<Notice key={warning} tone="warning" title="pi passes this through as text">
						{warning}
					</Notice>
				))}
				{save.error !== null && (
					<Notice tone="error" title="The skill was not saved">
						{save.error.message}
					</Notice>
				)}

				{tab === "form" && !unreadable ? (
					<>
						<Section title="Skill">
							{creating && (
								<Row
									stacked
									title="Name"
									description="The folder under the skills root, and the URL."
								>
									<Field data-invalid={errors.name !== undefined}>
										<FieldLabel htmlFor="skill-name" className="sr-only">
											Name
										</FieldLabel>
										<Input
											id="skill-name"
											aria-invalid={errors.name !== undefined}
											autoComplete="off"
											value={draft.name}
											onChange={(event) => update({ name: event.target.value })}
										/>
										{errors.name !== undefined && <FieldError>{errors.name}</FieldError>}
									</Field>
								</Row>
							)}
							<Row
								stacked
								title="Description"
								description="What pi tells the model about this skill."
							>
								<Field data-invalid={errors.description !== undefined}>
									<FieldLabel htmlFor="skill-description" className="sr-only">
										Description
									</FieldLabel>
									<Textarea
										id="skill-description"
										aria-invalid={errors.description !== undefined}
										rows={3}
										value={draft.description}
										onChange={(event) => update({ description: event.target.value })}
									/>
									{errors.description !== undefined && (
										<FieldError>{errors.description}</FieldError>
									)}
								</Field>
							</Row>
							<Row
								title="Model invocation"
								description="Whether the model may load this skill on its own."
							>
								<EnabledSwitch
									checked={draft.modelInvocation}
									label="model invocation"
									onCheckedChange={(modelInvocation) => update({ modelInvocation })}
								/>
							</Row>
							<Row title="License" description="Kept in the file; blank removes the key.">
								<Input
									aria-label="License"
									value={draft.license}
									onChange={(event) => update({ license: event.target.value })}
								/>
							</Row>
							<Row title="Compatibility" description="Kept in the file; blank removes the key.">
								<Input
									aria-label="Compatibility"
									value={draft.compatibility}
									onChange={(event) => update({ compatibility: event.target.value })}
								/>
							</Row>
						</Section>

						<Section title="Instructions">
							<div className="p-3">
								<CodeEditor
									className="h-96"
									label="Skill instructions"
									language="markdown"
									value={draft.body}
									onChange={(body) => update({ body })}
								/>
							</div>
						</Section>

						{(file?.fields ?? []).length > 0 && (
							<Section
								description="pi ignores these; they survive every save."
								title="Other frontmatter"
							>
								{file?.fields.map((field) => (
									<Row key={field.key} title={field.key} description={field.value}>
										<Badge variant="outline">{field.owner}</Badge>
									</Row>
								))}
							</Section>
						)}
					</>
				) : creating ? (
					<Notice tone="info">Save the skill once, then its file can be edited as text.</Notice>
				) : (
					<SkillRaw name={file.name} root={root} />
				)}
			</div>

			<DeleteDialog
				open={form.deleteOpen}
				title={`Delete ${view?.name ?? draft.name}?`}
				description="Its folder and every file in it are removed. This cannot be undone."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => remove.mutate(file?.name ?? draft.name)}
			/>
		</DetailPage>
	);
}
