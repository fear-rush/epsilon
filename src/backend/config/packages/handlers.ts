import { Effect } from "effect";

import { PackageRpcs } from "#protocol/config/packages";

import { PackageService } from "./service.ts";

/**
 * Settings → Packages over the socket. The service owns pi's manager and the filter
 * rules; the group owns the shapes and the tagged failure.
 */
export const PackageHandlersLive = PackageRpcs.toLayer(
	Effect.gen(function* () {
		const packages = yield* PackageService;
		return {
			"config.packages.list": ({ folder }) => packages.list(folder),
			"config.packages.resources": ({ folder, source, scope }) =>
				packages.resources(folder, source, scope),
			"config.packages.updates": ({ folder }) => packages.updates(folder),
			"config.packages.install": ({ folder, source, scope }) =>
				packages.install(folder, source, scope),
			"config.packages.remove": ({ folder, source, scope }) =>
				packages.remove(folder, source, scope),
			"config.packages.update": ({ folder, source, scope }) =>
				packages.update(folder, source, scope),
			"config.packages.setResource": ({ folder, input }) => packages.setResource(folder, input),
		};
	}),
);
