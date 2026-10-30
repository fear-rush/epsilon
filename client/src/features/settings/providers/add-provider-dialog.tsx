/**
 * The add flow. It lists the providers pi ships (searchable) and one custom
 * option, instead of putting every built-in in the page. A built-in that already
 * has an entry or a credential is marked, not hidden.
 */
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BuiltinProvider } from "@/api/types";

export function AddProviderDialog({
	open,
	onOpenChange,
	builtins,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	builtins: BuiltinProvider[];
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const matches = builtins.filter(
		(provider) =>
			provider.name.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle),
	);

	const go = (providerId: string) => {
		onOpenChange(false);
		setQuery("");
		void navigate({
			to: "/settings/providers/$providerId",
			params: { providerId },
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add a provider</DialogTitle>
					<DialogDescription>
						Pick a provider pi ships to give it a key or endpoint, or define your own.
					</DialogDescription>
				</DialogHeader>
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						value={query}
						placeholder="Search providers"
						className="pl-8"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<div className="max-h-96 overflow-y-auto rounded-2xl border">
					<button
						type="button"
						className="flex w-full cursor-pointer items-center gap-3 border-b px-3 py-3 text-left hover:bg-muted/60"
						onClick={() => go("new")}
					>
						<span className="grid size-8 place-items-center rounded-lg bg-muted">
							<PlusIcon className="size-4" />
						</span>
						<span className="min-w-0">
							<span className="block text-sm font-medium">Custom provider</span>
							<span className="block text-xs text-muted-foreground">
								Base URL, API and models you define
							</span>
						</span>
					</button>
					{matches.length === 0 ? (
						<p className="px-3 py-4 text-sm text-muted-foreground">No provider matches.</p>
					) : (
						matches.map((provider) => (
							<button
								key={provider.id}
								type="button"
								className="flex w-full cursor-pointer items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/60"
								onClick={() => go(provider.id)}
							>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">{provider.name}</span>
									<span className="block truncate text-xs text-muted-foreground">
										{provider.id}
									</span>
								</span>
								{provider.configured && <Badge variant="secondary">Configured</Badge>}
							</button>
						))
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					Choosing a provider opens its settings. Nothing is written until you save.
				</p>
			</DialogContent>
		</Dialog>
	);
}
