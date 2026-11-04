import { Effect } from "effect";

import { SkillRpcs } from "#protocol/config/skills";

import { SkillsService } from "./service.ts";

/**
 * Settings → Skills over the socket. The service owns pi's resolver, the files and the
 * `skills` setting; the group owns the shapes and the tagged refusal.
 */
export const SkillHandlersLive = SkillRpcs.toLayer(
	Effect.gen(function* () {
		const skills = yield* SkillsService;
		return {
			"config.skills.list": ({ folder }) => skills.list(folder),
			"config.skills.read": ({ folder, root, name }) => skills.read(folder, root, name),
			"config.skills.save": ({ folder, root, name, input }) =>
				skills.save(folder, root, name, input),
			"config.skills.remove": ({ folder, root, name }) => skills.remove(folder, root, name),
			"config.skills.setEnabled": ({ folder, filePath, enabled }) =>
				skills.setEnabled(folder, filePath, enabled),
			"config.skills.readRaw": ({ folder, root, name }) =>
				skills.readRaw(folder, root, name).pipe(Effect.map((text) => ({ text }))),
			"config.skills.writeRaw": ({ folder, root, name, text }) =>
				skills.writeRaw(folder, root, name, text),
			"config.skills.readDocument": ({ folder, filePath }) => skills.readDocument(folder, filePath),
		};
	}),
);
