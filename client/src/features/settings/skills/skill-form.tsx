/**
 * The page of one editable skill, written as `<root>/<name>/SKILL.md`. The Form
 * tab has cards for the skill, its instructions and its files; the Raw tab edits
 * any file of the folder as text. The form edits the frontmatter pi acts on
 * (description, whether the model may load it) and the body; every other key is
 * kept as the file has it. A draft holds the edits until Save; a new skill
 * becomes a real route after its first save.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { deleteSkill, saveSkill } from "@/api/endpoints";
import type { SkillFile, SkillInput, SkillRoot, SkillView } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	CancelDialog,
	DeleteDialog,
	UnsavedChangesBlock,
} from "@/components/patterns/dialog/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Section } from "@/components/patterns/section/section";
import { ModeTabs } from "@/components/patterns/tabs/mode-tabs";
import { useDraftForm } from "@/components/patterns/form/use-draft-form";
import {
	useSettings,
	useSettingsProject,
	useSettingsRefresh,
	useSkillFiles,
} from "@/features/settings/queries";
import { SkillCard } from "./skill-card";
import { skillFields, toDraft, toInput, validate } from "./skill-draft";
import type { SkillDraft, SkillField } from "./skill-draft";
import { SkillFiles } from "./skill-files";
import { SkillInstructions } from "./skill-instructions";
import { LoadedSwitch } from "./skill-loaded-switch";
import { SkillNotices } from "./skill-notices";
import { SKILL_MODES, SKILLS_BACK, type SkillTab } from "./skill-modes";
import { useSkillToggle } from "./skill-status";
import { SkillUnreadable } from "./skill-unreadable";
import { SkillRaw } from "./skill-raw";
import { useSkillLinks } from "./skill-references";

/** The Form or Raw choice and the open raw file, kept by the page so a reload keeps them. */
export type SkillPageState = {
	tab: SkillTab;
	setTab: (tab: SkillTab) => void;
	rawPath: string;
	setRawPath: (path: string) => void;
	/** Reads the skill again and drops the form's draft. */
	reload: () => void;
};

export function SkillForm({
	root,
	detail,
	view,
	page,
}: {
	root: SkillRoot;
	detail: SkillFile | undefined;
	view: SkillView | undefined;
	/** Absent for a new skill, which has nothing to show in Raw yet. */
	page?: SkillPageState;
}) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const projectPath = useSettingsProject();
	const creating = detail === undefined;
	const form = useDraftForm<SkillDraft, SkillField>({
		initial: () => toDraft(detail),
		fields: skillFields,
	});
	const { draft, update, errors } = form;
	const links = useSkillLinks();
	const toggle = useSkillToggle();
	// A tab switch that waits for the answer to "discard changes?".
	const [leaving, setLeaving] = useState<SkillTab | undefined>();

	const taken = new Set(
		(settings.data?.skills ?? []).filter((skill) => skill.root === root).map((skill) => skill.name),
	);

	const save = useMutation({
		mutationFn: (input: SkillInput) =>
			saveSkill(projectPath, root, detail?.name ?? draft.name, input),
		onSuccess: () => {
			form.markSaved();
			refresh();
			if (creating) {
				form.allowLeave();
				void navigate({
					to: "/settings/skills/$name",
					params: { name: draft.name },
					search: (previous) => ({ ...previous, root, path: undefined }),
					replace: true,
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: (name: string) => deleteSkill(projectPath, root, name),
		onSuccess: () => {
			form.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/skills" }).then(refresh);
		},
	});

	const submit = () => {
		const found = validate(draft, creating, taken);
		form.setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(toInput(draft));
	};
	const unreadable = detail?.parseError !== undefined;
	// A file with unsaved text blocks leaving the page just as the form does.
	const filesDirty = useRef(false);
	const rawDirty = useRef(false);
	const [rawChanged, setRawChanged] = useState(false);
	const fileList = useSkillFiles(root, creating || unreadable ? undefined : detail.name);
	const filePaths = fileList.data?.files.map((file) => file.path);
	const tab = page?.tab ?? "form";

	const requestTab = (next: SkillTab) => {
		if (page === undefined || next === tab) return;
		if ((tab === "raw" && rawDirty.current) || (tab === "form" && form.dirty)) setLeaving(next);
		else page.setTab(next);
	};
	const references = {
		skillExists: links.exists,
		openSkill: links.open,
		openFile: (path: string) => {
			if (page === undefined || filePaths?.includes(path) !== true) return;
			page.setRawPath(path);
			requestTab("raw");
		},
	};

	const formCards = unreadable ? (
		<SkillUnreadable error={detail.parseError ?? ""} raw={detail.raw ?? ""} />
	) : (
		<>
			<SkillCard draft={draft} errors={errors} creating={creating} update={update} />
			<SkillInstructions
				value={draft.body}
				onChange={(body) => update({ body })}
				files={filePaths}
				references={references}
			/>
			{!creating && (
				<Section title="Files">
					<div className="pad-row">
						<SkillFiles
							root={root}
							name={detail.name}
							onDirtyChange={(dirty) => {
								filesDirty.current = dirty;
							}}
						/>
					</div>
				</Section>
			)}
		</>
	);
	const showRaw = tab === "raw" && page !== undefined && detail !== undefined;
	const dirty = tab === "raw" ? rawChanged : form.dirty;

	return (
		<DetailPage
			title={detail?.name ?? "New skill"}
			back={SKILLS_BACK}
			bodyKey={tab}
			actions={view === undefined ? undefined : <LoadedSwitch skill={view} toggle={toggle} />}
			tabs={
				page === undefined || detail === undefined ? undefined : (
					<ModeTabs items={SKILL_MODES} value={tab} onValueChange={requestTab} />
				)
			}
			fill={showRaw}
			footerStatus={dirty ? "Unsaved changes" : creating ? "Not saved yet" : undefined}
			footer={
				unreadable && tab === "form" ? undefined : (
					<>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								if (creating) {
									form.setCancelOpen(true);
								} else {
									remove.reset();
									form.setDeleteOpen(true);
								}
							}}
						>
							{creating ? "Cancel" : "Delete"}
						</Button>
						{tab !== "raw" && (
							<Button type="button" disabled={save.isPending} onClick={submit}>
								{save.isPending && <Spinner data-icon="inline-start" />}
								Save
							</Button>
						)}
					</>
				)
			}
		>
			<SkillNotices skill={view} body={draft.body} errors={[toggle.error, save.error]} />

			{showRaw ? (
				<SkillRaw
					source={{ kind: "editable", root, name: detail.name }}
					path={page.rawPath}
					onPathChange={page.setRawPath}
					onDirtyChange={(isDirty) => {
						rawDirty.current = isDirty;
						setRawChanged(isDirty);
					}}
					onSaved={page.reload}
				/>
			) : (
				formCards
			)}

			{creating && (
				<CancelDialog
					open={form.cancelOpen}
					title="Cancel this skill?"
					description="Nothing is saved until you press Save. What you entered will be lost."
					onOpenChange={form.setCancelOpen}
					onDiscard={() => {
						form.allowLeave();
						void navigate({ to: "/settings/skills" });
					}}
				/>
			)}

			<UnsavedChangesBlock
				blocked={() => form.blocked() || filesDirty.current || rawDirty.current}
				subject="skill"
			/>

			<CancelDialog
				open={leaving !== undefined}
				title="Discard unsaved changes?"
				description={
					tab === "raw"
						? "The open file has changes that are not saved."
						: "The form has changes that are not saved."
				}
				onOpenChange={(next) => {
					if (!next) setLeaving(undefined);
				}}
				onDiscard={() => {
					if (leaving !== undefined && page !== undefined) {
						page.setTab(leaving);
						// Leaving the form drops its draft; a raw file drops its own text when it unmounts.
						if (tab === "form") page.reload();
					}
					setLeaving(undefined);
				}}
			/>

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
		</DetailPage>
	);
}
