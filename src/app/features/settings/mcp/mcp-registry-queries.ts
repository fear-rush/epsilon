import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";

import type { McpRegistrySearch, McpRegistrySource } from "#protocol/settings/mcp-registry";
import { call } from "@/core/runtime";
import { settingsKeys } from "@/features/settings/keys.ts";

/** A page is asked for by the cursor the previous one returned; the first has none. */
type Cursor = string | undefined;

/** The registry's pages for a search, twenty at a time; an empty search browses. */
export const useRegistrySearch = (source: McpRegistrySource, q: string) =>
	useInfiniteQuery<
		McpRegistrySearch,
		Error,
		InfiniteData<McpRegistrySearch, Cursor>,
		ReturnType<typeof settingsKeys.mcpRegistrySearch>,
		Cursor
	>({
		getNextPageParam: (page) => page.nextCursor,
		initialPageParam: undefined,
		queryFn: ({ pageParam, signal }) =>
			call((client) => client["settings.mcpRegistry.search"]({ cursor: pageParam, q, source }), {
				signal,
			}),
		queryKey: settingsKeys.mcpRegistrySearch(source, q),
		staleTime: 60_000,
	});

/** One registry server with its install options, read once it is picked. */
export const useRegistryServer = (
	picked: { source: McpRegistrySource; name: string } | undefined,
) =>
	useQuery({
		queryFn:
			picked === undefined
				? skipToken
				: ({ signal }) =>
						call(
							(client) =>
								client["settings.mcpRegistry.read"]({ name: picked.name, source: picked.source }),
							{ signal },
						),
		queryKey: settingsKeys.mcpRegistryServer(picked?.source ?? "official", picked?.name),
		staleTime: 60_000,
	});
