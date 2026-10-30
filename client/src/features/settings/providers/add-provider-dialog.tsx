/**
 * The add flow, in two steps: how, then which provider. "How" decides the list,
 * because a key and an account are not interchangeable: an account exists only where
 * pi declares one, and a custom endpoint has none at all. Either way the choice opens
 * the provider's own settings, where nothing is written until Save or a sign-in.
 */
import { useNavigate } from "@tanstack/react-router";
import { LogInIcon, PlusIcon, SearchIcon } from "lucide-react";
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

/** How the operator wants to connect: a key they hold, or an account pi signs in to. */
export type AddMode = "key" | "account";

/** What one row can say about a provider, in one word. */
const badgeOf = (provider: BuiltinProvider): string | undefined => {
	if (provider.auth.credential === "oauth") return "Signed in";
	if (provider.auth.credential === "api_key") return "Key stored";
	return provider.configured ? "Configured" : undefined;
};

const TITLE: Record<AddMode, string> = {
	key: "Add a provider with a key",
	account: "Sign in to a provider",
};

const DESCRIPTION: Record<AddMode, string> = {
	key: "Give a provider pi ships an endpoint and a key, or define your own.",
	account: "pi signs in to these providers and stores the credential in auth.json.",
};

export function AddProviderDialog({
	open,
	mode,
	onOpenChange,
	builtins,
}: {
	open: boolean;
	/** Which list to offer. It stays as chosen while the dialog closes, so the
	 * closing frame does not turn into the other kind of add. */
	mode: AddMode;
	onOpenChange: (open: boolean) => void;
	builtins: BuiltinProvider[];
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	// A provider without an account sign-in cannot be added this way, so it is not
	// offered rather than being refused one step later.
	const offered =
		mode === "account"
			? builtins.filter((provider) => provider.auth.oauth !== undefined)
			: builtins;
	const matches = offered.filter(
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
					<DialogTitle>{TITLE[mode]}</DialogTitle>
					<DialogDescription>{DESCRIPTION[mode]}</DialogDescription>
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
				<div className="max-h-96 overflow-y-auto rounded-xl border">
					{mode === "key" && (
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
					)}
					{matches.length === 0 ? (
						<p className="px-3 py-4 text-sm text-muted-foreground">
							{mode === "account"
								? "No provider pi ships signs in to an account."
								: "No provider matches."}
						</p>
					) : (
						matches.map((provider) => {
							const badge = badgeOf(provider);
							return (
								<button
									key={provider.id}
									type="button"
									className="flex w-full cursor-pointer items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/60"
									onClick={() => go(provider.id)}
								>
									<span className="min-w-0">
										<span className="flex items-center gap-2">
											{mode === "account" && (
												<LogInIcon className="size-3.5 text-muted-foreground" />
											)}
											<span className="block truncate text-sm font-medium">{provider.name}</span>
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{mode === "account"
												? (provider.auth.oauth?.label ?? provider.id)
												: provider.id}
										</span>
									</span>
									{badge !== undefined && <Badge variant="secondary">{badge}</Badge>}
								</button>
							);
						})
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					{mode === "account"
						? "Choosing a provider opens its settings; the sign-in starts when you press Sign in there."
						: "Choosing a provider opens its settings. Nothing is written until you save."}
				</p>
			</DialogContent>
		</Dialog>
	);
}
