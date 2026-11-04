import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import type { SkillView } from "#protocol/config/skills";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/runtime";

/**
 * Settings → Skills: every skill pi found, which of them may load, and the raw text of the
 * ones Epsilon may edit.
 *
 * pi decides the list; a switch writes the `-path` entry pi reads, and an edit writes the
 * file byte for byte as typed. A package's or an extension's skill is read-only here, and
 * the row says why.
 */
const skillsQuery = {
	queryKey: ["config", "skills", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.skills.list"]({ folder: null }), { signal }),
};

const rawQuery = (skill: SkillView) => ({
	queryKey: ["config", "skills", "raw", skill.filePath],
	queryFn: ({ signal }: { signal: AbortSignal }) => {
		const root = skill.root;
		if (root === undefined) throw new Error("This skill is not editable here.");
		return call(
			(client) => client["config.skills.readRaw"]({ folder: null, name: skill.name, root }),
			{ signal },
		);
	},
	enabled: skill.editable && skill.root !== undefined,
});

export function SettingsSkills() {
	const queryClient = useQueryClient();
	const skills = useQuery(skillsQuery);
	const [selected, setSelected] = useState<SkillView | undefined>(undefined);
	const [creating, setCreating] = useState(false);
	const [failure, setFailure] = useState<string | undefined>(undefined);

	const refresh = (): void => {
		void queryClient.invalidateQueries({ queryKey: ["config"] });
	};
	const setEnabled = useMutation({
		mutationFn: (input: { skill: SkillView; enabled: boolean }) =>
			call((client) =>
				client["config.skills.setEnabled"]({
					enabled: input.enabled,
					filePath: input.skill.filePath,
					folder: null,
				}),
			),
		onSuccess: refresh,
		onError: (error: Error) => setFailure(error.message),
	});

	if (skills.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Skills" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading pi's skills…" />
				</div>
			</Pane>
		);
	}

	if (skills.error !== null) {
		const view = errorView(skills.error);
		return (
			<Pane className="flex-1">
				<PaneBar title="Skills" />
				<StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />
			</Pane>
		);
	}

	return (
		<Pane className="flex-1">
			<PaneBar
				title="Skills"
				meta={`${skills.data.skills.length}`}
				actions={
					<Button size="sm" variant="outline" onClick={() => setCreating(true)}>
						<PlusIcon />
						New skill
					</Button>
				}
			/>
			<PaneBody page>
				{failure !== undefined && (
					<Notice tone="error" title="The skill list was not changed">
						{failure}
					</Notice>
				)}

				<Section
					title="Skills pi found"
					description="An active skill can load; a disabled or shadowed one stays on disk."
				>
					{skills.data.skills.length === 0 ? (
						<Row
							title="No skill"
							description="Create one here, or install a package that has one."
						/>
					) : (
						skills.data.skills.map((skill) => (
							<Row key={skill.filePath} title={skill.name} description={skill.description}>
								<Badge variant="outline">{skill.scope}</Badge>
								{skill.status === "active" ? (
									<Badge variant="secondary">active</Badge>
								) : (
									<Badge variant="warning">{skill.status}</Badge>
								)}
								<Switch
									aria-label={`${skill.name} enabled`}
									checked={skill.status !== "disabled"}
									disabled={skill.toggle !== "settings"}
									onCheckedChange={(enabled) => setEnabled.mutate({ enabled, skill })}
								/>
								<Button size="sm" variant="ghost" onClick={() => setSelected(skill)}>
									Open
								</Button>
							</Row>
						))
					)}
				</Section>

				{selected !== undefined && (
					<SkillEditor
						key={selected.filePath}
						skill={selected}
						onClose={() => setSelected(undefined)}
						onChanged={refresh}
						onFailure={setFailure}
					/>
				)}
			</PaneBody>

			<NewSkillDialog
				open={creating}
				onOpenChange={setCreating}
				onSaved={() => {
					setCreating(false);
					refresh();
				}}
			/>
		</Pane>
	);
}

/** One skill's raw file: the editor, the switch's reason, and what a save keeps. */
function SkillEditor({
	skill,
	onClose,
	onChanged,
	onFailure,
}: {
	skill: SkillView;
	onClose: () => void;
	onChanged: () => void;
	onFailure: (message: string) => void;
}) {
	const raw = useQuery(rawQuery(skill));
	const client = useQueryClient();
	const [text, setText] = useState<string | undefined>(undefined);
	const value = text ?? raw.data?.text ?? "";

	const save = useMutation({
		mutationFn: (next: string) => {
			const root = skill.root;
			if (root === undefined) throw new Error("This skill is not editable here.");
			return call((api) =>
				api["config.skills.writeRaw"]({
					folder: null,
					name: skill.name,
					root,
					text: next,
				}),
			);
		},
		onSuccess: () => {
			setText(undefined);
			onFailure("");
			void client.invalidateQueries({ queryKey: ["config"] });
			onChanged();
		},
		onError: (error: Error) => onFailure(error.message),
	});
	const remove = useMutation({
		mutationFn: () => {
			const root = skill.root;
			if (root === undefined) throw new Error("This skill is not editable here.");
			return call((api) => api["config.skills.remove"]({ folder: null, name: skill.name, root }));
		},
		onSuccess: () => {
			onClose();
			onChanged();
		},
		onError: (error: Error) => onFailure(error.message),
	});

	return (
		<Section title={skill.name} description={skill.filePath}>
			{skill.shadowedBy !== undefined && <Row title="Shadowed by" description={skill.shadowedBy} />}
			{skill.message !== undefined && (
				<Row title="pi refused this skill" description={skill.message} />
			)}
			{skill.warnings.map((warning) => (
				<Row key={warning} title="Warning" description={warning} />
			))}
			{skill.editable ? (
				<Row title="SKILL.md" stacked>
					{raw.isPending ? (
						<LoadingState label="Reading the file…" />
					) : (
						<>
							<Textarea
								aria-label={`${skill.name} raw text`}
								className="min-h-72 font-mono text-code"
								value={value}
								onChange={(event) => setText(event.target.value)}
							/>
							<div className="mt-2 flex items-center gap-2">
								<Button size="sm" disabled={save.isPending} onClick={() => save.mutate(value)}>
									Save
								</Button>
								<Button size="sm" variant="outline" onClick={onClose}>
									Close
								</Button>
								<Button
									size="sm"
									variant="destructive"
									disabled={remove.isPending}
									onClick={() => remove.mutate()}
								>
									Remove
								</Button>
							</div>
						</>
					)}
				</Row>
			) : (
				<Row
					title="Read-only here"
					description="A package's or an extension's skill is edited where it lives."
				>
					<Button size="sm" variant="outline" onClick={onClose}>
						Close
					</Button>
				</Row>
			)}
		</Section>
	);
}

/** A new skill in the agent home's own folder, with the one field pi requires. */
function NewSkillDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [body, setBody] = useState("");
	const [failure, setFailure] = useState<string | undefined>(undefined);
	const save = useMutation({
		mutationFn: (input: { name: string; description: string; body: string }) =>
			call((client) =>
				client["config.skills.save"]({
					folder: null,
					input: { body: input.body, description: input.description, modelInvocation: true },
					name: input.name,
					root: "home",
				}),
			),
		onSuccess: () => {
			setName("");
			setDescription("");
			setBody("");
			setFailure(undefined);
			onSaved();
		},
		onError: (error: Error) => setFailure(error.message),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New skill</DialogTitle>
					<DialogDescription>
						Written to the agent home as a <code>SKILL.md</code> pi and a terminal see it.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim() === "" || description.trim() === "") {
							setFailure("A name and a description are required.");
							return;
						}
						save.mutate({ body, description: description.trim(), name: name.trim() });
					}}
				>
					<Field>
						<FieldLabel htmlFor="skill-name">Name</FieldLabel>
						<Input
							id="skill-name"
							value={name}
							placeholder="release-checklist"
							autoComplete="off"
							onChange={(event) => setName(event.target.value)}
						/>
						<FieldDescription>A folder name: letters, digits and dashes.</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="skill-description">Description</FieldLabel>
						<Input
							id="skill-description"
							value={description}
							placeholder="When to load this skill"
							autoComplete="off"
							onChange={(event) => setDescription(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="skill-body">Body</FieldLabel>
						<Textarea
							id="skill-body"
							value={body}
							rows={6}
							placeholder="What the skill tells the model."
							onChange={(event) => setBody(event.target.value)}
						/>
					</Field>
					{failure !== undefined && (
						<Notice tone="error" title="The skill was not written">
							{failure}
						</Notice>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
