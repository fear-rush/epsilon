import { Effect } from "effect";

import { ProjectRpcs } from "#protocol/config/projects";

import { ProjectService } from "./service.ts";

/**
 * Projects over the socket. The service owns the path checks and pi's trust file; the
 * group owns the shapes and the tagged refusal.
 */
export const ProjectHandlersLive = ProjectRpcs.toLayer(
	Effect.gen(function* () {
		const projects = yield* ProjectService;
		return {
			"config.projects.status": ({ path }) => projects.status(path),
			"config.projects.setTrust": ({ path, action }) => projects.setTrust(path, action),
			"config.projects.folders": ({ path, hidden }) => projects.folders(path, hidden ?? false),
			"config.projects.createFolder": ({ parent, name }) => projects.createFolder(parent, name),
		};
	}),
);
