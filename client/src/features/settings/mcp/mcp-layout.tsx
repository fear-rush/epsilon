import { useMatchRoute } from "@tanstack/react-router";

import { MasterDetailLayout } from "@/features/settings/kit/master-detail-layout";

import { McpPanel } from "./mcp-panel";
import { asScope } from "./scope";

/** The route owns which server is selected; the panel only draws it. */
export function McpLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/mcp/$scope/$name" });
	const selected =
		matched === false ? undefined : { scope: asScope(matched.scope), name: matched.name };
	const adding = matchRoute({ to: "/settings/mcp/$scope/new" }) !== false;
	const editing = selected !== undefined || adding;
	return (
		<MasterDetailLayout
			editing={editing}
			list={<McpPanel selected={selected} editing={editing} />}
		/>
	);
}
