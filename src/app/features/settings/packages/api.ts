import type { PackageResourceInput, PackageScope } from "#protocol/config/packages";
import { call } from "@/runtime";

const folder = (project: string | undefined) => ({ folder: project ?? null });

export const installPackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["config.packages.install"]({ ...folder(project), scope, source }));

export const removePackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["config.packages.remove"]({ ...folder(project), scope, source }));

export const updatePackage = (project: string | undefined, source: string, scope: PackageScope) =>
	call((client) => client["config.packages.update"]({ ...folder(project), scope, source }));

export const setPackageResource = (project: string | undefined, input: PackageResourceInput) =>
	call((client) => client["config.packages.setResource"]({ ...folder(project), input }));
