import { useMatchRoute } from "@tanstack/react-router";
import { ChevronDownIcon, LogInIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

import { buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListItem } from "@/components/patterns/list/list-item";
import { ListPane } from "@/components/patterns/list/list-pane";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { useSettings } from "@/features/settings/queries";
import { AddProviderDialog } from "./add-provider-dialog";
import type { AddMode } from "./add-provider-dialog";

/**
 * The left side of the provider editor: configured providers, the models of the
 * selected one, and the add flow. A provider appears here when models.json has an
 * entry or when it has a credential, never just because pi ships it.
 */

function ProvidersPanel({ selectedId }: { selectedId: string | undefined }) {
	const settings = useSettings();
	const [query, setQuery] = useState("");
	const [addMode, setAddMode] = useState<AddMode>("key");
	const [addOpen, setAddOpen] = useState(false);

	const providers = settings.data?.providers ?? [];
	const needle = query.trim().toLowerCase();
	const visible = providers.filter(
		(provider) =>
			provider.name.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle),
	);

	return (
		<ListPane
			title="Providers"
			count={providers.length}
			error={settings.error}
			notices={
				settings.data?.error === undefined ? undefined : (
					<Notice tone="error">{settings.data.error}</Notice>
				)
			}
			query={query}
			onQueryChange={setQuery}
			searchLabel="Search providers"
			pending={settings.isPending}
			pendingLabel="Reading providers…"
			empty={
				visible.length === 0
					? providers.length === 0
						? "No provider configured yet."
						: "Nothing matches."
					: undefined
			}
			footer={
				<>
					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(buttonVariants({ variant: "outline" }), "group w-full")}
						>
							<PlusIcon />
							Add provider
							<ChevronDownIcon className="ml-auto transition-transform group-data-[popup-open]:rotate-180" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-(--anchor-width)">
							<DropdownMenuItem
								onClick={() => {
									setAddMode("key");
									setAddOpen(true);
								}}
							>
								<PlusIcon />
								With an API key
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									setAddMode("account");
									setAddOpen(true);
								}}
							>
								<LogInIcon />
								Sign in with an account
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<AddProviderDialog
						open={addOpen}
						mode={addMode}
						onOpenChange={setAddOpen}
						builtins={settings.data?.builtins ?? []}
					/>
				</>
			}
		>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-row animate-enter-left">
				{visible.map((provider) => (
					<ListItem
						key={provider.id}
						link={{ to: "/settings/providers/$providerId", params: { providerId: provider.id } }}
						name={provider.name}
						description={provider.custom ? undefined : "pi default"}
						selected={selectedId === provider.id}
					/>
				))}
			</div>
		</ListPane>
	);
}

/** The route owns which provider is selected; the panel only draws it. */
export function ProvidersLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/providers/$providerId" });
	const selectedId = matched === false ? undefined : matched.providerId;
	const adding = matchRoute({ to: "/settings/providers/new" }) !== false;
	const editing = selectedId !== undefined || adding;
	return <MasterDetail editing={editing} list={<ProvidersPanel selectedId={selectedId} />} />;
}
