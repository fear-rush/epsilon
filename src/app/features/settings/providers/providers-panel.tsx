import { Link, useMatchRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { buttonVariants } from "@/components/ui/button";

import { useSettings } from "../queries.ts";

/** Settings → Providers, the list beside the selected provider's editor. */
export function ProvidersLayout() {
	const matched = useMatchRoute()({ to: "/settings/providers/$providerId" });
	const selected = matched === false ? undefined : matched.providerId;
	return (
		<MasterDetail editing={selected !== undefined} list={<ProvidersList selected={selected} />} />
	);
}

function ProvidersList({ selected }: { selected: string | undefined }) {
	const settings = useSettings();
	const [query, setQuery] = useState("");
	const providers = settings.data?.providers.providers ?? [];
	const needle = query.trim().toLowerCase();
	const visible = providers.filter((provider) =>
		`${provider.id} ${provider.name}`.toLowerCase().includes(needle),
	);

	return (
		<ListPane
			title="Providers"
			count={providers.length}
			empty={
				visible.length === 0
					? providers.length === 0
						? "No provider yet"
						: "Nothing matches"
					: undefined
			}
			error={settings.error}
			footer={
				<Link
					to="/settings/providers/new"
					search
					className={buttonVariants({ variant: "outline" })}
				>
					<PlusIcon />
					Add provider
				</Link>
			}
			onQueryChange={setQuery}
			pending={settings.isPending}
			pendingLabel="Reading pi's model catalog…"
			query={query}
			searchLabel="Search providers"
		>
			<ListGroup>
				{visible.map((provider) => (
					<ListItem
						key={provider.id}
						name={provider.name}
						description={`${provider.models} ${provider.models === 1 ? "model" : "models"}${
							provider.auth.label === undefined
								? provider.auth.configured
									? ""
									: " · no key"
								: ` · ${provider.auth.label}`
						}`}
						selected={selected === provider.id}
						link={{
							params: { providerId: provider.id },
							to: "/settings/providers/$providerId",
						}}
					/>
				))}
			</ListGroup>
		</ListPane>
	);
}
