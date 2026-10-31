/**
 * Step 1 of the add dialog's Registry tab: search a registry, pick a server,
 * pick how to install it. The tab keeps its own height; the list and the
 * options scroll inside it.
 */
import { ArrowLeftIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { UseQueryResult } from "@tanstack/react-query";

import { Tip } from "@/components/patterns/tip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@/components/ui/item";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { McpRegistryDetail, McpRegistryItem, McpRegistrySource } from "@/api/types";

import { chosenOption } from "./mcp-registry";
import type { RegistryDraft } from "./mcp-registry";
import { useRegistrySearch } from "./mcp-registry-queries";

const SOURCES: { value: McpRegistrySource; title: string }[] = [
	{ value: "official", title: "Official" },
	{ value: "github", title: "GitHub" },
];

const DEBOUNCE_MS = 300;

/** The text, as it was a moment ago: a search runs when typing pauses. */
function useDebounced(value: string): string {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [value]);
	return settled;
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-full items-center justify-center text-body text-muted-foreground">
			{children}
		</div>
	);
}

function ResultList({
	source,
	query,
	onPick,
}: {
	source: McpRegistrySource;
	query: string;
	onPick: (item: McpRegistryItem) => void;
}) {
	const search = useRegistrySearch(source, query.trim());
	if (search.isPending) {
		return (
			<Centered>
				<Spinner />
			</Centered>
		);
	}
	if (search.isError) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{search.error.message}</AlertDescription>
			</Alert>
		);
	}
	const items = search.data.pages.flatMap((page) => page.items);
	if (items.length === 0) return <Centered>No servers found</Centered>;
	return (
		<div className="grid gap-2">
			<ItemGroup className="gap-1">
				{items.map((item) => (
					<Item
						key={`${item.source}:${item.name}`}
						size="xs"
						variant="outline"
						className="cursor-pointer text-left hover:bg-muted"
						render={<button type="button" onClick={() => onPick(item)} />}
					>
						<ItemContent>
							<ItemTitle className="max-w-full truncate">{item.title}</ItemTitle>
							<ItemDescription className="line-clamp-1">{item.description}</ItemDescription>
						</ItemContent>
						<ItemActions>
							{item.kinds.map((kind) => (
								<Badge key={kind} variant="secondary">
									{kind}
								</Badge>
							))}
						</ItemActions>
					</Item>
				))}
			</ItemGroup>
			{search.hasNextPage && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="justify-self-center"
					disabled={search.isFetchingNextPage}
					onClick={() => void search.fetchNextPage()}
				>
					{search.isFetchingNextPage && <Spinner data-icon="inline-start" />}
					Load more
				</Button>
			)}
		</div>
	);
}

function OptionPicker({
	detail,
	optionId,
	onOption,
}: {
	detail: McpRegistryDetail;
	optionId: string | undefined;
	onOption: (id: string) => void;
}) {
	const { options } = detail;
	const chosen = chosenOption(options, optionId);
	if (options.length === 0) {
		return (
			<Alert variant="warning">
				<AlertDescription>This server lists no way to install it.</AlertDescription>
			</Alert>
		);
	}
	if (options.length === 1) {
		const only = options[0];
		return (
			<Item variant="muted" size="xs">
				<ItemContent>
					<ItemTitle className="max-w-full truncate">{only?.label}</ItemTitle>
					{only?.supported === false && (
						<ItemDescription className="line-clamp-1">{only.reason}</ItemDescription>
					)}
				</ItemContent>
			</Item>
		);
	}
	return (
		<Field>
			<FieldLabel htmlFor="mcp-registry-option">Install</FieldLabel>
			<Select
				items={options.map((option) => ({ value: option.id, label: option.label }))}
				value={chosen?.id ?? null}
				onValueChange={(next) => {
					if (next !== null) onOption(next);
				}}
			>
				<SelectTrigger id="mcp-registry-option" className="w-full">
					<SelectValue placeholder="Choose" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{options.map((option) => (
							<SelectItem key={option.id} value={option.id} disabled={!option.supported}>
								<span className="grid min-w-0 text-left">
									<span className="truncate">{option.label}</span>
									{!option.supported && (
										<span className="truncate text-meta text-muted-foreground">
											{option.reason}
										</span>
									)}
								</span>
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}

function ServerView({
	detail,
	draft,
	onChange,
	onBack,
}: {
	detail: UseQueryResult<McpRegistryDetail>;
	draft: RegistryDraft;
	onChange: (patch: Partial<RegistryDraft>) => void;
	onBack: () => void;
}) {
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex items-center gap-2">
				<Tip label="Back to results">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Back to results"
						onClick={onBack}
					>
						<ArrowLeftIcon />
					</Button>
				</Tip>
				<span className="min-w-0 flex-1 truncate text-body font-medium">
					{detail.data?.title ?? draft.picked?.name}
				</span>
				{detail.data?.repositoryUrl !== undefined && (
					<Tip label="Open repository">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Open repository"
							render={<a href={detail.data.repositoryUrl} target="_blank" rel="noreferrer" />}
						>
							<ExternalLinkIcon />
						</Button>
					</Tip>
				)}
			</div>
			<div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto">
				{detail.isPending && (
					<Centered>
						<Spinner />
					</Centered>
				)}
				{detail.isError && (
					<Alert variant="destructive">
						<AlertDescription>{detail.error.message}</AlertDescription>
					</Alert>
				)}
				{detail.data !== undefined && (
					<>
						<p className="line-clamp-2 text-body text-muted-foreground">
							{detail.data.description}
						</p>
						{detail.data.note !== undefined && (
							<Alert variant="warning">
								<AlertDescription>{detail.data.note}</AlertDescription>
							</Alert>
						)}
						<OptionPicker
							detail={detail.data}
							optionId={draft.optionId}
							onOption={(optionId) => onChange({ optionId, values: {} })}
						/>
					</>
				)}
			</div>
		</div>
	);
}

export function McpRegistryBrowser({
	draft,
	detail,
	onChange,
}: {
	draft: RegistryDraft;
	detail: UseQueryResult<McpRegistryDetail>;
	onChange: (patch: Partial<RegistryDraft>) => void;
}) {
	const query = useDebounced(draft.query);
	if (draft.picked !== undefined) {
		return (
			<ServerView
				detail={detail}
				draft={draft}
				onChange={onChange}
				onBack={() =>
					onChange({ picked: undefined, optionId: undefined, values: {}, name: undefined })
				}
			/>
		);
	}
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex items-center gap-2">
				<Tabs
					value={draft.source}
					onValueChange={(value) => {
						const source = SOURCES.find((candidate) => candidate.value === value);
						if (source !== undefined) onChange({ source: source.value });
					}}
				>
					<TabsList aria-label="Registry">
						{SOURCES.map((source) => (
							<TabsTrigger key={source.value} value={source.value} className="px-3">
								{source.title}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<InputGroup className="flex-1">
					<InputGroupAddon>
						<SearchIcon />
					</InputGroupAddon>
					<InputGroupInput
						aria-label="Search servers"
						placeholder="Search"
						value={draft.query}
						onChange={(event) => onChange({ query: event.target.value })}
					/>
				</InputGroup>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ResultList
					source={draft.source}
					query={query}
					onPick={(item) =>
						onChange({
							picked: { source: item.source, name: item.name },
							optionId: undefined,
							values: {},
							name: undefined,
						})
					}
				/>
			</div>
		</div>
	);
}
