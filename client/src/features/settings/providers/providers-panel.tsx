import { Link, useMatchRoute } from "@tanstack/react-router";
import { ChevronDownIcon, LogInIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MasterListPanel } from "@/features/settings/kit/master-list-panel";
import { useSettings } from "@/features/settings/queries";
import { AddProviderDialog } from "./add-provider-dialog";
import type { AddMode } from "./add-provider-dialog";
import { MasterDetailLayout } from "@/features/settings/kit/master-detail-layout";

/**
 * The left side of the provider editor: configured providers, the models of the
 * selected one, and the add flow. A provider appears here when models.json has an
 * entry or when it has a credential, never just because pi ships it.
 */

function ProvidersPanel({
	selectedId,
	editing,
}: {
	selectedId: string | undefined;
	editing: boolean;
}) {
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
		<MasterListPanel
			title="Providers"
			count={providers.length}
			editing={editing}
			error={settings.data?.error}
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
			{visible.map((provider) => (
				<Link
					key={provider.id}
					to="/settings/providers/$providerId"
					params={{ providerId: provider.id }}
					className={cn(
						"flex items-center gap-2 rounded-md px-2 py-2 transition-colors",
						selectedId === provider.id ? "bg-muted" : "hover:bg-muted/60",
					)}
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-medium">{provider.name}</span>
						{!provider.custom && (
							<span className="block truncate text-xs text-muted-foreground">pi default</span>
						)}
					</span>
					<span className="shrink-0 text-xs text-muted-foreground">
						{provider.modelCount} {provider.modelCount === 1 ? "model" : "models"}
					</span>
				</Link>
			))}
		</MasterListPanel>
	);
}

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
