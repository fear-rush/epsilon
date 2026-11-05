import { Effect } from "effect";

import { SkillRpcs } from "#protocol/settings/skills";

import { SkillsService } from "./service.ts";

/**
 * Settings → Skills over the socket. The service owns pi's resolver, the files and the
 * `skills` setting; the group owns the shapes and the tagged refusal.
 */
export const SkillHandlersLive = SkillRpcs.toLayer(
	Effect.gen(function* () {
		const skills = yield* SkillsService;
		return {
			"settings.skills.list": ({ folder }) => skills.list(folder),
			"settings.skills.read": ({ folder, root, name }) => skills.read(folder, root, name),
			"settings.skills.save": ({ folder, root, name, input }) =>
				skills.save(folder, root, name, input),
			"settings.skills.remove": ({ folder, root, name }) => skills.remove(folder, root, name),
			"settings.skills.setEnabled": ({ folder, filePath, enabled }) =>
				skills.setEnabled(folder, filePath, enabled),
			"settings.skills.readRaw": ({ folder, root, name }) =>
				skills.readRaw(folder, root, name).pipe(Effect.map((text) => ({ text }))),
			"settings.skills.writeRaw": ({ folder, root, name, text }) =>
				skills.writeRaw(folder, root, name, text),
			"settings.skills.readDocument": ({ folder, filePath }) =>
				skills.readDocument(folder, filePath),
			"settings.skills.setFolderLinked": ({ folder, path, linked }) =>
				skills.setFolderLinked(folder, path, linked),
		};
	}),
);
