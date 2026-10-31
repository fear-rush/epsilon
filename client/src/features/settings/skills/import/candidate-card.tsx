import { ChevronRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/patterns/status/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import type { SkillImportCandidate } from "@/api/types";

import { formatBytes } from "./read-folder";

const Disclosure = ({
	label,
	tone,
	children,
}: {
	label: string;
	tone?: "warning";
	children: React.ReactNode;
}) => (
	<Collapsible>
		<CollapsibleTrigger
			className={`group/disclosure flex items-center gap-1 rounded text-meta outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone === "warning" ? "text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}
		>
			<ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]/disclosure:rotate-90" />
			{label}
		</CollapsibleTrigger>
		<CollapsibleContent>{children}</CollapsibleContent>
	</Collapsible>
);

/** One skill found in the source: what it is, what is wrong with it, and whether to install it. */
export function CandidateCard({
	candidate,
	checked,
	onCheckedChange,
	existsHere,
	replace,
	onReplaceChange,
	targetLabel,
}: {
	candidate: SkillImportCandidate;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	/** The name is already installed in the chosen target. */
	existsHere: boolean;
	replace: boolean;
	onReplaceChange: (replace: boolean) => void;
	targetLabel: string;
}) {
	const blocked = candidate.errors.length > 0;
	const id = `skill-import-${candidate.dir || candidate.name}`;
	const bytes = candidate.files.reduce((sum, file) => sum + file.size, 0);
	return (
		<li className="flex items-start gap-2 rounded-xl border p-3">
			<Checkbox
				id={id}
				checked={checked && !blocked}
				disabled={blocked}
				onCheckedChange={(next) => onCheckedChange(next === true)}
			/>
			<div className="grid min-w-0 flex-1 gap-1.5">
				<div className="flex items-start gap-2">
					<div className="grid min-w-0 flex-1 gap-0.5">
						<FieldLabel htmlFor={id} className="font-medium">
							{candidate.name}
						</FieldLabel>
						<p className="text-body text-muted-foreground">
							{candidate.description || "No description"}
						</p>
					</div>
					<Badge variant="outline" className="shrink-0">
						{candidate.modelInvocation ? "Auto + /skill:name" : "Only via /skill:name"}
					</Badge>
				</div>
				<p className="text-meta text-muted-foreground">
					{candidate.files.length} files, {formatBytes(bytes)}
					{candidate.dir === "" ? "" : ` · ${candidate.dir}`}
				</p>
				{candidate.errors.map((issue) => (
					<Notice key={`${issue.code}${issue.path ?? ""}${issue.message}`} tone="error">
						{issue.message}
						{issue.path === undefined ? "" : ` (${issue.path})`}
					</Notice>
				))}
				{candidate.warnings.map((issue) => (
					<Notice key={`${issue.code}${issue.path ?? ""}${issue.message}`} tone="warning">
						{issue.message}
						{issue.path === undefined ? "" : ` (${issue.path})`}
					</Notice>
				))}
				{candidate.removed.length > 0 ? (
					<p className="text-meta text-muted-foreground">Removed: {candidate.removed.join(", ")}</p>
				) : null}
				{candidate.scripts.length > 0 ? (
					<Disclosure label="Contains scripts — review before installing" tone="warning">
						<ul className="mt-1 grid gap-0.5 font-mono text-meta">
							{candidate.scripts.map((script) => (
								<li key={script}>{script}</li>
							))}
						</ul>
					</Disclosure>
				) : null}
				<Disclosure label={`Files (${candidate.files.length})`}>
					<ul className="mt-1 grid max-h-dialog-body-sm gap-0.5 overflow-y-auto font-mono text-meta">
						{candidate.files.map((file) => (
							<li key={file.path} className="flex justify-between gap-3">
								<span className="min-w-0 truncate">{file.path}</span>
								<span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
							</li>
						))}
					</ul>
				</Disclosure>
				{existsHere && !blocked ? (
					<Field orientation="horizontal" className="mt-1">
						<Checkbox
							id={`${id}-replace`}
							checked={replace}
							onCheckedChange={(next) => onReplaceChange(next === true)}
						/>
						<FieldLabel htmlFor={`${id}-replace`} className="font-normal">
							Replace existing {candidate.name} in {targetLabel}
						</FieldLabel>
					</Field>
				) : null}
			</div>
		</li>
	);
}
