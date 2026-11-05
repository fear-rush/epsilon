import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import type { SkillFile, SkillInput, SkillRoot, SkillView } from "#protocol/settings/skills";
import { CancelDialog, DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { EnabledSwitch } from "@/components/patterns/enabled-switch";
import { ModeTabs } from "@/components/patterns/mode-tabs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { useDraftForm } from "@/components/patterns/use-draft-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useSettings, useSettingsProject, useSettingsRefresh } from "../queries.ts";
import { removeSkill, saveSkill, setSkillEnabled } from "./api.ts";
import { SkillCard } from "./skill-card.tsx";
import { skillFields, toDraft, toInput, validate } from "./skill-draft.ts";
import type { SkillDraft, SkillField } from "./skill-draft.ts";
import { SkillFiles } from "./skill-files.tsx";
import { SkillInstructions } from "./skill-instructions.tsx";
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
		fields: skillFields,
		initial: () => toDraft(file, view?.name),
	});
	const { draft, update, errors } = form;
	const [tab, setTab] = useState<SkillTab>("form");
	/** The open raw file, which is `SKILL.md` until a click in the tree moves it. */
	const [rawPath, setRawPath] = useState("SKILL.md");
	/** Text typed in the raw tab and not saved: leaving the tab would drop it. */
	const rawDirty = useRef(false);
	const [pendingTab, setPendingTab] = useState<SkillTab | undefined>();
	const requestTab = (next: SkillTab): void => {
		if (next === tab) return;
		if (tab === "raw" && rawDirty.current) setPendingTab(next);
		else setTab(next);
	};
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
				unreadable ? undefined : (
					<ModeTabs items={SKILL_MODES} value={tab} onValueChange={requestTab} />
				)
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
				{view?.message !== undefined && <Notice tone="danger">{view.message}</Notice>}
				{(view?.warnings ?? []).map((warning) => (
					<Notice key={warning} tone="warning">
						{warning}
					</Notice>
				))}
				{file?.parseError !== undefined && (
					<Notice tone="danger" title="The frontmatter does not parse">
						{file.parseError} Only the Raw tab can edit this file.
					</Notice>
				)}
				{(file?.bodyWarnings ?? []).map((warning) => (
					<Notice key={warning} tone="warning" title="pi passes this through as text">
						{warning}
					</Notice>
				))}
				{save.error !== null && <Notice error={save.error} title="The skill was not saved" />}

				{tab === "form" && !unreadable ? (
					<>
						<SkillCard draft={draft} errors={errors} creating={creating} update={update} />

						<SkillInstructions value={draft.body} onChange={(body) => update({ body })} />

						{!creating && (
							<Section
								title="Files"
								description="Bundled next to SKILL.md. Each one is written on its own."
							>
								<div className="p-3">
									<SkillFiles
										root={root}
										name={file.name}
										// The page-level leave guard is main's form row, still open; until then
										// the card guards its own dialogs.
										onDirtyChange={() => undefined}
									/>
								</div>
							</Section>
						)}

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
					<SkillRaw
						source={{ kind: "editable", name: file.name, root }}
						path={rawPath}
						onPathChange={setRawPath}
						onDirtyChange={(dirty) => {
							rawDirty.current = dirty;
						}}
						onSaved={refresh}
					/>
				)}
			</div>

			<CancelDialog
				open={pendingTab !== undefined}
				title="Discard unsaved changes?"
				description={`${rawPath} has changes that are not saved. Switching now loses them.`}
				onOpenChange={(next) => {
					if (next) return;
					setPendingTab(undefined);
				}}
				onDiscard={() => {
					rawDirty.current = false;
					if (pendingTab !== undefined) setTab(pendingTab);
					setPendingTab(undefined);
				}}
			/>

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
