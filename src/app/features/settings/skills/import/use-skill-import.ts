/**
 * The import's state machine: pick a source, stage it, review the report, commit. A stage
 * lives on the server, so every way out of the review, closing, starting over or a cancel
 * that raced a slow fetch, discards it; a committed stage the server already removed.
 */
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { StageGone } from "#protocol/errors";
import type { SkillImportReport } from "#protocol/settings/skill-import";
import { call } from "@/core/runtime";

import { useSettingsRefresh } from "../../queries.ts";
import type { PickedFile } from "./read-folder.ts";

export type StageRequest =
	| {
			readonly kind: "upload";
			readonly files: ReadonlyArray<PickedFile>;
			readonly omitted: string[];
	  }
	| { readonly kind: "source"; readonly input: string };

export type Staged = { readonly report: SkillImportReport; readonly omitted: string[] };

export type Commit = {
	readonly skills: string[];
	readonly target: "global" | "project";
	readonly replace: string[];
	readonly mode: "copy" | "package";
};

const folder = (project: string | undefined) => ({ folder: project ?? null });

/** The browser's `File` objects as the wire's named bytes, read once per stage. */
const uploadFiles = async (files: ReadonlyArray<PickedFile>) =>
	Promise.all(
		files.map(async ({ file, path }) => ({
			bytes: new Uint8Array(await file.arrayBuffer()),
			name: path,
		})),
	);

export function useSkillImport(project: string | undefined) {
	const refresh = useSettingsRefresh();
	const [staged, setStaged] = useState<Staged | undefined>(undefined);
	/** A cancelled stage still finishes on the server; its answer is discarded on arrival. */
	const generation = useRef(0);

	/** One stage, upload or pasted source; the answer is the report the review reads. */
	const stageRequest = async (request: StageRequest): Promise<SkillImportReport> => {
		if (request.kind === "source") {
			return call((client) =>
				client["settings.skills.import.stageSource"]({ ...folder(project), input: request.input }),
			);
		}
		const files = await uploadFiles(request.files);
		return call((client) =>
			client["settings.skills.import.stageUpload"]({ ...folder(project), files }),
		);
	};

	const stage = useMutation({
		mutationFn: async (request: StageRequest): Promise<Staged> => ({
			omitted: request.kind === "upload" ? request.omitted : [],
			report: await stageRequest(request),
		}),
		onMutate: () => {
			generation.current += 1;
			return { generation: generation.current };
		},
		onSuccess: (result, _request, context) => {
			if (context.generation !== generation.current) {
				void call((client) =>
					client["settings.skills.import.discard"]({
						...folder(project),
						stageId: result.report.stageId,
					}),
				).catch(() => undefined);
				return;
			}
			setStaged(result);
		},
	});

	const commit = useMutation({
		mutationFn: (input: Commit) => {
			if (staged === undefined) throw new Error("There is nothing staged to install");
			return call((client) =>
				client["settings.skills.import.commit"]({
					...folder(project),
					commit: input,
					stageId: staged.report.stageId,
				}),
			);
		},
		onSuccess: () => {
			setStaged(undefined);
			refresh();
		},
	});

	const discard = (): void => {
		if (staged !== undefined) {
			void call((client) =>
				client["settings.skills.import.discard"]({
					...folder(project),
					stageId: staged.report.stageId,
				}),
			).catch(() => undefined);
		}
		setStaged(undefined);
	};

	return {
		staged,
		stage,
		commit,
		/** The staged import is gone from the server (it expired after an hour). */
		expired: commit.error instanceof StageGone,
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
