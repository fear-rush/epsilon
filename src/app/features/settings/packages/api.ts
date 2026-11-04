import type { PackageResourceInput, PackageScope } from "#protocol/settings/packages";
import { call } from "@/core/runtime";

const folder = (project: string | undefined) => ({ folder: project ?? null });

export const installPackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["settings.packages.install"]({ ...folder(project), scope, source }));

export const removePackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["settings.packages.remove"]({ ...folder(project), scope, source }));

export const updatePackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["settings.packages.update"]({ ...folder(project), scope, source }));

export const setPackageResource = (project: string | undefined, input: PackageResourceInput) =>
	call((client) => client["settings.packages.setResource"]({ ...folder(project), input }));
