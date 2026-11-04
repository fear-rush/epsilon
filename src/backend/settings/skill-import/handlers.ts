import { Effect } from "effect";

import { SkillImportRpcs } from "#protocol/settings/skill-import";

import { SkillImportService } from "./service.ts";

/**
 * Settings → Skills → Import over the socket. The service owns the stage and the checks;
 * the group owns the shapes and the two tagged failures.
 */
export const SkillImportHandlersLive = SkillImportRpcs.toLayer(
	Effect.gen(function* () {
		const skills = yield* SkillImportService;
		return {
			"settings.skills.import.stageSource": ({ folder, input }) =>
				skills.stageSource(folder, input),
			"settings.skills.import.stageUpload": ({ folder, files }) =>
				skills.stageUpload(folder, files),
			"settings.skills.import.report": ({ folder, stageId }) => skills.report(folder, stageId),
			"settings.skills.import.commit": ({ folder, stageId, commit }) =>
				skills.commit(folder, stageId, commit),
			"settings.skills.import.discard": ({ folder, stageId }) => skills.discard(folder, stageId),
		};
	}),
);
