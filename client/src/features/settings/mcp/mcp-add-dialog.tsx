import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { withValues } from "shared";
import type { McpScope } from "shared";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { saveMcpServer } from "@/api/endpoints";
import { useSettings, useSettingsProject, useSettingsRefresh } from "@/features/settings/queries";
import { McpAddSource } from "./mcp-add-source";
import { McpAddValues } from "./mcp-add-values";
import type { TypedValues } from "./mcp-add-values";
import { candidatesOf, emptySource, inputOfCandidate, previewOfPaste } from "./mcp-import";
import type { Candidate, SourceDraft } from "./mcp-import";
import { nameProblemOf } from "./mcp-import";
import {
	chosenOption,
	defaultNameOf,
	emptyRegistry,
	missingInputs,
	serverOf,
} from "./mcp-registry";
import type { RegistryDraft } from "./mcp-registry";
import { useRegistryServer } from "./mcp-registry-queries";
import { McpRegistryValues } from "./mcp-registry-values";

/**
 * Add MCP servers in two steps. The first says how they are described (a registry
 * entry, a pasted config, a command or a URL) and previews what was found; the second asks only
 * for the values the paste left empty and for where the servers go. Each server
 * is written once through the same route a server page saves with, and the
 * dialog ends on the first one's page. The dialog is one size on every tab and
 * step: the body has a fixed height and scrolls inside it.
 */

/** Longer than the dialog's close transition. */
const RESET_MS = 300;

type Step = "source" | "values";

export function McpAddDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	// The flow's state restarts once the close transition has played, so the next add is fresh.
	const [epoch, setEpoch] = useState(0);
	const change = (next: boolean) => {
		onOpenChange(next);
		if (!next) window.setTimeout(() => setEpoch((current) => current + 1), RESET_MS);
	};
	return <AddFlow key={epoch} open={open} onOpenChange={change} />;
}

function AddFlow({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const onClose = () => onOpenChange(false);
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const settings = useSettings();
	const project = useSettingsProject();
	const projectName =
		project === undefined ? undefined : (settings.data?.project?.name ?? "This project");

	const [step, setStep] = useState<Step>("source");
	const [source, setSource] = useState<SourceDraft>(emptySource);
	const [values, setValues] = useState<TypedValues>({});
	const [registry, setRegistry] = useState<RegistryDraft>(emptyRegistry);
	const [scope, setScope] = useState<McpScope>(project === undefined ? "global" : "project");

	const paste = useMemo(
		() => previewOfPaste(source.paste, source.pasteName),
		[source.paste, source.pasteName],
	);
	const registryDetail = useRegistryServer(registry.picked);
	const option =
		registryDetail.data === undefined
			? undefined
			: chosenOption(registryDetail.data.options, registry.optionId);
	const registryName = (
		registry.name ?? (registry.picked === undefined ? "" : defaultNameOf(registry.picked.name))
	).trim();
	const registryServer = option?.supported === true ? serverOf(option, registry.values) : undefined;
	const registryReady =
		option !== undefined &&
		registryServer !== undefined &&
		nameProblemOf(registryName) === undefined &&
		missingInputs(option, registry.values).length === 0;
	const candidates = useMemo(
		(): Candidate[] =>
			source.mode === "registry"
				? registryReady
					? [{ id: 0, name: registryName, server: registryServer, resolved: true }]
					: []
				: candidatesOf(source, paste),
		[source, paste, registryReady, registryName, registryServer],
	);
	const taken = new Set(
		(settings.data?.mcp ?? []).filter((entry) => entry.scope === scope).map((entry) => entry.name),
	);
	const clash = candidates.some((candidate) => taken.has(candidate.name));

	const add = useMutation({
		mutationFn: async () => {
			const added: Candidate[] = [];
			for (const candidate of candidates) {
				const filled: Candidate =
					candidate.resolved === true
						? candidate
						: { ...candidate, server: withValues(candidate.server, values[candidate.id] ?? {}) };
				try {
					await saveMcpServer(project, inputOfCandidate(filled, scope));
				} catch (error) {
					const message = error instanceof Error ? error.message : "The write failed";
					const done = added.map((entry) => entry.name).join(", ");
					throw new Error(
						`${candidate.name} was not added: ${message}${done === "" ? "" : ` (Added before it: ${done}.)`}`,
					);
				}
				added.push(candidate);
			}
			return added;
		},
		onSuccess: (added) => {
			refresh();
			onClose();
			const first = added[0];
			if (first !== undefined) {
				void navigate({
					to: "/settings/mcp/$scope/$name",
					params: { scope, name: first.name },
					search: (previous) => previous,
				});
			}
		},
		onError: () => refresh(),
	});

	const patchSource = (patch: Partial<SourceDraft>) =>
		setSource((current) => ({ ...current, ...patch }));
	const patchRegistry = (patch: Partial<RegistryDraft>) =>
		setRegistry((current) => ({ ...current, ...patch }));
	const count = candidates.length;
	const registryMode = source.mode === "registry";
	const canContinue = registryMode ? option?.supported === true : count > 0;

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="lg"
			title="Add MCP server"
			footer={
				step === "source" ? (
					<>
						<Button type="button" variant="destructive" onClick={onClose}>
							Cancel
						</Button>
						<Button type="button" disabled={!canContinue} onClick={() => setStep("values")}>
							Next
						</Button>
					</>
				) : (
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={add.isPending}
							onClick={() => {
								add.reset();
								setStep("source");
							}}
						>
							Back
						</Button>
						<Button
							type="button"
							disabled={add.isPending || clash || count === 0}
							onClick={() => add.mutate()}
						>
							{add.isPending && <Spinner data-icon="inline-start" />}
							{count === 1 || registryMode ? "Add server" : `Add ${count} servers`}
						</Button>
					</>
				)
			}
		>
			<div className="flex h-full flex-col gap-3 overflow-hidden">
				{step === "source" ? (
					<McpAddSource
						source={source}
						paste={paste}
						registry={registry}
						registryDetail={registryDetail}
						onChange={patchSource}
						onRegistry={patchRegistry}
					/>
				) : (
					<div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
						{registryMode && option !== undefined ? (
							<McpRegistryValues
								option={option}
								name={registry.name ?? registryName}
								values={registry.values}
								scope={scope}
								projectName={projectName}
								taken={taken}
								onName={(name) => patchRegistry({ name })}
								onValue={(key, value) =>
									setRegistry((current) => ({
										...current,
										values: { ...current.values, [key]: value },
									}))
								}
								onScope={setScope}
							/>
						) : (
							<McpAddValues
								candidates={candidates}
								values={values}
								scope={scope}
								projectName={projectName}
								taken={taken}
								onScope={setScope}
								onValue={(candidate, id, value) =>
									setValues((current) => ({
										...current,
										[candidate]: { ...current[candidate], [id]: value },
									}))
								}
							/>
						)}
					</div>
				)}

				{add.error !== null && <Notice tone="error">{add.error.message}</Notice>}
			</div>
		</DialogFrame>
	);
}
