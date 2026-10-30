import { useMatchRoute } from "@tanstack/react-router";

import { MasterDetailLayout } from "@/features/settings/kit/master-detail-layout";

import { ProvidersPanel } from "./providers-panel";

/** The route owns which provider is selected; the panel only draws it. */
export function ProvidersLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/providers/$providerId" });
	const selectedId = matched === false ? undefined : matched.providerId;
	const adding = matchRoute({ to: "/settings/providers/new" }) !== false;
	const editing = selectedId !== undefined || adding;
	return (
		<MasterDetailLayout
			editing={editing}
			list={<ProvidersPanel selectedId={selectedId} editing={editing} />}
		/>
	);
}
