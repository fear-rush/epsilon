/**
 * User skills, written as `<agent home>/skills/<name>/SKILL.md`. The frontmatter
 * the panel edits is `description`; the body is the instructions pi loads when a
 * task matches.
 */
import { useMutation } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { SettingsSnapshot, SkillInput, SkillView } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { deleteSkill, fetchSkill, saveSkill } from "@/lib/api";

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from "./settings-section";
import { useSettingsRefresh } from "./settings-refresh";

type SkillForm = SkillInput;

const blankForm = (): SkillForm => ({ name: "", description: "", body: "" });

export function SettingsSkills({ snapshot }: { snapshot: SettingsSnapshot }) {
	const [form, setForm] = useState<SkillForm>(blankForm);
	const [editing, setEditing] = useState<string | undefined>(undefined);
	const [loadError, setLoadError] = useState<string | undefined>(undefined);
	const [pendingDelete, setPendingDelete] = useState<SkillView | undefined>(undefined);
	const refresh = useSettingsRefresh();
	const update = (patch: Partial<SkillForm>) => setForm((current) => ({ ...current, ...patch }));
	const reset = () => {
		setForm(blankForm());
		setEditing(undefined);
		save.reset();
	};

	const save = useMutation({
		mutationFn: saveSkill,
		onSuccess: () => {
			reset();
			refresh();
		},
	});
	const remove = useMutation({
		mutationFn: deleteSkill,
		onSuccess: () => {
			setPendingDelete(undefined);
			refresh();
		},
	});
	const load = async (skill: SkillView) => {
		setLoadError(undefined);
		save.reset();
		try {
			const full = await fetchSkill(skill.name);
			setEditing(skill.name);
			setForm(full);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<SettingsPage title="Skills">
			<SettingsGroup title="User skills">
				{snapshot.skills.length === 0 ? (
					<SettingsRow title="No user skill" description="Add one below." />
				) : (
					snapshot.skills.map((skill) => (
						<SettingsRow key={skill.name} title={skill.name} description={skill.description}>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Edit ${skill.name}`}
								onClick={() => void load(skill)}
							>
								<PencilIcon />
							</Button>
							<Button
								variant="destructive"
								size="icon-sm"
								aria-label={`Remove ${skill.name}`}
								onClick={() => {
									remove.reset();
									setPendingDelete(skill);
								}}
							>
								<Trash2Icon />
							</Button>
						</SettingsRow>
					))
				)}
			</SettingsGroup>
			{loadError !== undefined && (
				<Alert variant="destructive">
					<AlertDescription>{loadError}</AlertDescription>
				</Alert>
			)}

			<SettingsGroup
				title={editing === undefined ? "Add a skill" : `Edit ${editing}`}
				description="The description decides when the agent considers this skill."
			>
				<SettingsBlock>
					<form
						className="grid gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							save.mutate(form);
						}}
					>
						<FieldGroup className="gap-3">
							<Field>
								<FieldLabel htmlFor="skill-name">Name</FieldLabel>
								<Input
									id="skill-name"
									required
									value={form.name}
									disabled={editing !== undefined}
									onChange={(event) => update({ name: event.target.value })}
								/>
								<FieldDescription>
									The directory under the agent home's skills folder
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="skill-description">Description</FieldLabel>
								<Input
									id="skill-description"
									required
									value={form.description}
									onChange={(event) => update({ description: event.target.value })}
								/>
								<FieldDescription>What it does and when the agent should use it</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="skill-instructions">Instructions</FieldLabel>
								<Textarea
									id="skill-instructions"
									rows={8}
									className="font-mono text-xs"
									value={form.body}
									onChange={(event) => update({ body: event.target.value })}
								/>
							</Field>
						</FieldGroup>
						{save.error !== null && (
							<Alert variant="destructive">
								<AlertDescription>{save.error.message}</AlertDescription>
							</Alert>
						)}
						<div className="flex items-center justify-end gap-2">
							<Button type="submit" disabled={save.isPending || form.name.trim() === ""}>
								{save.isPending ? <Spinner /> : <PlusIcon />}
								{editing === undefined ? "Add skill" : "Save skill"}
							</Button>
							{editing !== undefined && (
								<Button type="button" variant="ghost" onClick={reset}>
									Cancel
								</Button>
							)}
						</div>
					</form>
				</SettingsBlock>
			</SettingsGroup>

			<AlertDialog
				open={pendingDelete !== undefined}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							The skill directory and every file in it are deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{remove.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{remove.error.message}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (pendingDelete !== undefined) remove.mutate(pendingDelete.name);
							}}
						>
							{remove.isPending && <Spinner data-icon="inline-start" />}
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsPage>
	);
}
