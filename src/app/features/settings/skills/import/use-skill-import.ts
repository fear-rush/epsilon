import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { SkillImportReport } from "#protocol/settings/skill-import";
import { call } from "@/core/runtime";

import { useSettingsProject, useSettingsRefresh } from "../../queries.ts";
import type { PickedFile } from "./read-files.ts";

export type StageRequest =
	| { readonly kind: "upload"; readonly files: ReadonlyArray<PickedFile> }
	| { readonly kind: "source"; readonly input: string };

export type Commit = {
	readonly skills: ReadonlyArray<string>;
	readonly target: "global" | "project";
	readonly replace: ReadonlyArray<string>;
	readonly mode: "copy" | "package";
};

const folder = (project: string | undefined) => ({ folder: project ?? null });

/** Stage a source, review the report, commit the chosen skills. A stage always leaves. */
export function useSkillImport() {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [report, setReport] = useState<SkillImportReport | undefined>(undefined);

	const stage = useMutation({
		mutationFn: (request: StageRequest) =>
			request.kind === "upload"
				? call((client) =>
						client["settings.skills.import.stageUpload"]({
							...folder(project),
							files: request.files.map((file) => ({
								bytes: file.bytes,
								name: file.name,
							})),
						}),
					)
				: call((client) =>
						client["settings.skills.import.stageSource"]({
							...folder(project),
							input: request.input,
						}),
					),
		onSuccess: (next) => setReport(next),
	});

	const commit = useMutation({
		mutationFn: (input: Commit) => {
			if (report === undefined) throw new Error("There is nothing staged to install");
			return call((client) =>
				client["settings.skills.import.commit"]({
					...folder(project),
					commit: input,
					stageId: report.stageId,
				}),
			);
		},
		onSuccess: () => {
			setReport(undefined);
			refresh();
		},
	});

	const discard = (): void => {
		if (report === undefined) return;
		const stageId = report.stageId;
		void call((client) =>
			client["settings.skills.import.discard"]({ ...folder(project), stageId }),
		).catch(() => undefined);
		setReport(undefined);
		commit.reset();
		stage.reset();
	};

	return {
		report,
		stage,
		commit,
		discard,
		/** Back to the source step, dropping the stage. */
		startOver: discard,
	};
}
