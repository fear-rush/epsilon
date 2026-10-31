/**
 * The add flow, in two steps: how, then which provider. "How" decides the list,
 * because a key and an account are not interchangeable: an account exists only where
 * pi declares one, and a custom endpoint has none at all. Either way the choice opens
 * the provider's own settings, where nothing is written until Save or a sign-in.
 */
import { useNavigate } from "@tanstack/react-router";
import { LogInIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { ListItem } from "@/components/patterns/list/list-item";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="md"
			title={TITLE[mode]}
			footer={
				<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
			}
		>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-field">
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						value={query}
						placeholder="Search providers"
						aria-label="Search providers"
						className="pl-8"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<div className="grid gap-row">
					{mode === "key" && (
						<ListItem
							name="Custom provider"
							description="Base URL, API and models you define"
							trailing={<PlusIcon className="size-4 text-muted-foreground" />}
							onClick={() => go("new")}
						/>
					)}
					{matches.length === 0 ? (
						<StatusView
							icon={SearchIcon}
							title={
								mode === "account" ? "No provider signs in to an account" : "No provider matches"
							}
						/>
					) : (
						matches.map((provider) => {
							const badge = badgeOf(provider);
							return (
								<ListItem
									key={provider.id}
									name={provider.name}
									description={
										mode === "account" ? (provider.auth.oauth?.label ?? provider.id) : provider.id
									}
									trailing={
										<>
											{mode === "account" && <LogInIcon className="size-4 text-muted-foreground" />}
											{badge !== undefined && <Badge variant="secondary">{badge}</Badge>}
										</>
									}
									onClick={() => go(provider.id)}
								/>
							);
						})
					)}
				</div>
			</div>
		</DialogFrame>
	);
}
