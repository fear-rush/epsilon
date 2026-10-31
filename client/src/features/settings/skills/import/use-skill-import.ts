/**
 * The import's state machine: pick a source, stage it, review the report, commit.
 * A stage lives on the server, so every way out of the review, closing, starting over
 * or a cancel that raced a slow fetch, discards it; a committed stage the server
 * already removed.
 */
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
	commitSkillImport,
	discardSkillImport,
	stageSkillSource,
	stageSkillUpload,
} from "@/api/endpoints";
import { RefusalError } from "@/api/client";
import type { SkillImportReport } from "@/api/types";
import { useSettingsRefresh } from "@/features/settings/queries";

import type { PickedFile } from "./read-folder";

export type StageRequest =
	| { kind: "upload"; files: PickedFile[]; omitted: string[] }
	| { kind: "source"; input: string };

export type Staged = { report: SkillImportReport; omitted: string[] };

export type Commit = {
	skills: string[];
	target: "global" | "project";
	replace: string[];
	mode: "copy" | "package";
};

export function useSkillImport(project: string | undefined) {
	const refresh = useSettingsRefresh();
	const [staged, setStaged] = useState<Staged | undefined>(undefined);
	/** A cancelled stage still finishes on the server; its answer is discarded on arrival. */
	const generation = useRef(0);

	const stage = useMutation({
		mutationFn: async (request: StageRequest): Promise<Staged> => {
			const report =
				request.kind === "upload"
					? await stageSkillUpload(project, request.files)
					: await stageSkillSource(project, request.input);
			return { report, omitted: request.kind === "upload" ? request.omitted : [] };
		},
		onMutate: () => {
			generation.current += 1;
			return { generation: generation.current };
		},
		onSuccess: (result, _request, context) => {
			if (context.generation !== generation.current) {
				void discardSkillImport(result.report.stageId).catch(() => undefined);
				return;
			}
			setStaged(result);
		},
	});

	const commit = useMutation({
		mutationFn: (input: Commit) => {
			if (staged === undefined) throw new Error("There is nothing staged to install");
			return commitSkillImport(project, staged.report.stageId, input);
		},
		onSuccess: () => {
			setStaged(undefined);
			refresh();
		},
	});

	const discard = () => {
		if (staged !== undefined) void discardSkillImport(staged.report.stageId).catch(() => undefined);
		setStaged(undefined);
	};

	return {
		staged,
		stage,
		commit,
		/** The staged import is gone from the server (it expired after an hour). */
		expired: commit.error instanceof RefusalError && commit.error.status === 404,
		/** Stop waiting for a slow fetch; whatever it stages is discarded when it lands. */
		cancel: () => {
			generation.current += 1;
			stage.reset();
		},
		/** Back to the source step, dropping the stage. */
		startOver: () => {
			discard();
			commit.reset();
			stage.reset();
		},
		/** Leaving the dialog: the stage goes, committed or not. */
		leave: () => {
			generation.current += 1;
			discard();
		},
	};
}
