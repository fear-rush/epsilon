import { Effect } from "effect";

import { ProjectRpcs } from "#protocol/settings/projects";

import { ProjectService } from "./service.ts";

/**
 * Projects over the socket. The service owns the path checks and pi's trust file; the
 * group owns the shapes and the tagged refusal.
 */
export const ProjectHandlersLive = ProjectRpcs.toLayer(
	Effect.gen(function* () {
		const projects = yield* ProjectService;
		return {
			"settings.projects.status": ({ path }) => projects.status(path),
			"settings.projects.setTrust": ({ path, action }) => projects.setTrust(path, action),
			"settings.projects.folders": ({ path, hidden }) => projects.folders(path, hidden ?? false),
			"settings.projects.createFolder": ({ parent, name }) => projects.createFolder(parent, name),
		};
	}),
);
