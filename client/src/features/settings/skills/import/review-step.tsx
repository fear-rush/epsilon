import { useState } from "react";
import { createPortal } from "react-dom";

import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import { CandidateCard } from "./candidate-card";
import type { Commit, Staged } from "./use-skill-import";

type Target = Commit["target"];
type Mode = Commit["mode"];

/** A native radio, styled by the accent, so the group keeps its arrow-key behavior. */
function Choice({
	name,
	value,
	checked,
	disabled,
	onSelect,
	label,
	description,
}: {
	name: string;
	value: string;
	checked: boolean;
	disabled?: boolean;
	onSelect: () => void;
	label: string;
	description?: string;
}) {
	const id = `skill-import-${name}-${value}`;
	return (
		<Field orientation="horizontal" className="items-start" data-disabled={disabled}>
			<input
				id={id}
				type="radio"
				name={name}
				checked={checked}
				disabled={disabled}
				onChange={onSelect}
				className="mt-1 accent-primary"
			/>
			<div className="grid gap-0.5">
				<FieldLabel htmlFor={id} className="font-normal">
					{label}
				</FieldLabel>
				{description !== undefined && <FieldDescription>{description}</FieldDescription>}
			</div>
		</Field>
	);
}

/** Step two: the validation report, a choice of skills, where and how to install. */
export function ReviewStep({
	staged,
	project,
	installing,
	error,
	expired,
	onInstall,
	onBack,
	footer,
}: {
	staged: Staged;
	/** The project the Settings tab shows, or undefined on the Global tab. */
	project: string | undefined;
	installing: boolean;
	error: string | undefined;
	expired: boolean;
	onInstall: (commit: Commit) => void;
	onBack: () => void;
	/** The frame's footer element, where Back and Install go. */
	footer: HTMLElement | null;
}) {
	const { report, omitted } = staged;
	const [picked, setPicked] = useState<ReadonlySet<string>>(
		() => new Set(report.candidates.filter((c) => c.errors.length === 0).map((c) => c.name)),
	);
	const [replace, setReplace] = useState<ReadonlySet<string>>(new Set());
	const [target, setTarget] = useState<Target>(project === undefined ? "global" : "project");
	const [mode, setMode] = useState<Mode>("copy");
	const targetLabel = target === "global" ? "the agent home" : "this project";

	const chosen = report.candidates.filter((c) => picked.has(c.name) && c.errors.length === 0);
	const unresolved = chosen.filter((c) => c.existing[target] && !replace.has(c.name));
	const toggle = (set: ReadonlySet<string>, name: string, on: boolean) => {
		const next = new Set(set);
		if (on) next.add(name);
		else next.delete(name);
		return next;
	};
	const installable = chosen.length > 0 && unresolved.length === 0 && !installing;

	return (
		<div className="grid gap-field">
			<p className="text-body text-muted-foreground">
				From <span className="font-mono text-foreground">{report.source}</span>
				{omitted.length > 0 ? `. Left out of the upload: ${omitted.join(", ")}` : ""}
			</p>

			<ul className="grid gap-2" aria-label="Skills found">
				{report.candidates.map((candidate) => (
					<CandidateCard
						key={`${candidate.dir}:${candidate.name}`}
						candidate={candidate}
						checked={picked.has(candidate.name)}
						onCheckedChange={(on) => setPicked((set) => toggle(set, candidate.name, on))}
						existsHere={candidate.existing[target]}
						replace={replace.has(candidate.name)}
						onReplaceChange={(on) => setReplace((set) => toggle(set, candidate.name, on))}
						targetLabel={targetLabel}
					/>
				))}
			</ul>

			<FieldGroup className="gap-field">
				<fieldset className="grid gap-2">
					<legend className="mb-1 text-body font-medium">Install to</legend>
					<Choice
						name="target"
						value="global"
						checked={target === "global"}
						onSelect={() => setTarget("global")}
						label="Global (agent home)"
					/>
					{project === undefined ? null : (
						<Choice
							name="target"
							value="project"
							checked={target === "project"}
							onSelect={() => setTarget("project")}
							label="This project (.agents/skills)"
						/>
					)}
				</fieldset>
				<fieldset className="grid gap-2">
					<legend className="mb-1 text-body font-medium">How</legend>
					<Choice
						name="mode"
						value="copy"
						checked={mode === "copy"}
						onSelect={() => setMode("copy")}
						label="Copy (snapshot, recommended)"
					/>
					<Choice
						name="mode"
						value="package"
						checked={mode === "package"}
						disabled={!report.packageOption.available}
						onSelect={() => setMode("package")}
						label="Install as package (keeps updating)"
						description={report.packageOption.available ? undefined : report.packageOption.reason}
					/>
				</fieldset>
			</FieldGroup>

			{unresolved.length > 0 ? (
				<Notice tone="warning">
					{unresolved.map((c) => c.name).join(", ")} already exist in {targetLabel}. Tick Replace
					existing, untick the skill, or pick the other place.
				</Notice>
			) : null}
			{error === undefined ? null : (
				<Notice tone="error">
					{expired ? "This import expired after an hour. Start over to fetch it again." : error}
				</Notice>
			)}

			{footer !== null &&
				createPortal(
					<>
						<Button type="button" variant="destructive" onClick={onBack} disabled={installing}>
							{expired ? "Start over" : "Back"}
						</Button>
						<Button
							type="button"
							disabled={!installable || expired}
							onClick={() =>
								onInstall({
									skills: chosen.map((c) => c.name),
									target,
									replace: chosen.filter((c) => replace.has(c.name)).map((c) => c.name),
									mode,
								})
							}
						>
							{installing ? <Spinner data-icon="inline-start" /> : null}
							{chosen.length > 1 ? `Install ${chosen.length} skills` : "Install"}
						</Button>
					</>,
					footer,
				)}
		</div>
	);
}
