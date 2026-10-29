/**
 * The left side of the provider editor: configured providers, the models of the
 * selected one, and the add flow. A provider appears here when models.json has an
 * entry or when it has a credential, never just because pi ships it.
 */
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/use-settings";

import { AddProviderDialog } from "./add-provider-dialog";

export function ProvidersPanel({
	selectedId,
	editing,
}: {
	selectedId: string | undefined;
	editing: boolean;
}) {
	const settings = useSettings();
	const [query, setQuery] = useState("");
	const [addOpen, setAddOpen] = useState(false);

	const providers = settings.data?.providers ?? [];
	const needle = query.trim().toLowerCase();
	const visible = providers.filter(
		(provider) =>
			provider.name.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle),
	);

	return (
		<aside
			className={cn(
				"w-full shrink-0 flex-col border-r bg-background md:flex md:w-80",
				editing ? "hidden md:flex" : "flex",
			)}
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
				<span className="text-sm font-medium">Providers</span>
				<span className="text-xs text-muted-foreground">{providers.length}</span>
			</div>
			{settings.data?.error !== undefined && (
				<div className="shrink-0 p-2">
					<Alert variant="destructive">
						<AlertDescription className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
							{settings.data.error}
						</AlertDescription>
					</Alert>
				</div>
			)}
			<div className="shrink-0 p-2">
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						placeholder="Search providers"
						aria-label="Search providers"
						className="pl-8"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{settings.isPending ? (
					<div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
						<Spinner />
						Reading providers…
					</div>
				) : settings.error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{settings.error.message}</AlertDescription>
					</Alert>
				) : visible.length === 0 ? (
					<p className="px-2 py-3 text-xs text-muted-foreground">
						{providers.length === 0 ? "No provider configured yet." : "Nothing matches."}
					</p>
				) : (
					visible.map((provider) => (
						<Link
							key={provider.id}
							to="/settings/providers/$providerId"
							params={{ providerId: provider.id }}
							className={cn(
								"flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
								selectedId === provider.id ? "bg-muted" : "hover:bg-muted/60",
							)}
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">{provider.name}</span>
								<span className="block truncate text-xs text-muted-foreground">
									{provider.custom ? provider.id : "pi default"}
								</span>
							</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								{provider.modelCount} {provider.modelCount === 1 ? "model" : "models"}
							</span>
						</Link>
					))
				)}
			</div>
			<div className="shrink-0 border-t p-2">
				<Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
					<PlusIcon />
					Add provider
				</Button>
			</div>
			<AddProviderDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				builtins={settings.data?.builtins ?? []}
			/>
		</aside>
	);
}
