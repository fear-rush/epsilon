import { Effect } from "effect";

import { PackageRpcs } from "#protocol/settings/packages";

import { PackageService } from "./service.ts";

/**
 * Settings → Packages over the socket. The service owns pi's manager and the filter
 * rules; the group owns the shapes and the tagged failure.
 */
export const PackageHandlersLive = PackageRpcs.toLayer(
	Effect.gen(function* () {
		const packages = yield* PackageService;
		return {
			"settings.packages.list": ({ folder }) => packages.list(folder),
			"settings.packages.resources": ({ folder, source, scope }) =>
				packages.resources(folder, source, scope),
			"settings.packages.updates": ({ folder }) => packages.updates(folder),
			"settings.packages.install": ({ folder, source, scope }) =>
				packages.install(folder, source, scope),
			"settings.packages.remove": ({ folder, source, scope }) =>
				packages.remove(folder, source, scope),
			"settings.packages.update": ({ folder, source, scope }) =>
				packages.update(folder, source, scope),
			"settings.packages.setResource": ({ folder, input }) => packages.setResource(folder, input),
		};
	}),
);
