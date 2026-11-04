import { useMutation } from "@tanstack/react-query";

import type { PackageResourceInput, PackageView } from "#protocol/config/packages";

import { useSettingsProject, useSettingsRefresh } from "../queries.ts";
import { setPackageResource } from "./api.ts";

/**
 * Turns one resource of a package on or off. The write is a filter in the
 * package's own settings entry (`-<rel>`, or `+<rel>` for a project delta), so
 * the server resolves the resource again rather than trusting the browser, then
 * the whole settings family is re-read.
 */
export function usePackageResourceToggle(source: string, scope: PackageView["scope"]) {
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	return useMutation({
		mutationFn: (input: Pick<PackageResourceInput, "type" | "path" | "enabled">) =>
			setPackageResource(project, { ...input, source, scope }),
		onSuccess: () => refresh(),
	});
}
