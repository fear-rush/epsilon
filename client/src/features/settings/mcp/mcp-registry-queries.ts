import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";

import { settingsKeys } from "@/api/keys";
import { fetchMcpRegistryServer, searchMcpRegistry } from "@/api/endpoints";
import type { McpRegistrySearch, McpRegistrySource } from "@/api/types";

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
		queryKey: settingsKeys.mcpRegistrySearch(source, q),
		queryFn: ({ pageParam }) => searchMcpRegistry(source, q, pageParam),
		initialPageParam: undefined,
		getNextPageParam: (page) => page.nextCursor,
		staleTime: 60_000,
	});

/** One registry server with its install options, read once it is picked. */
export const useRegistryServer = (
	picked: { source: McpRegistrySource; name: string } | undefined,
) =>
	useQuery({
		queryKey: settingsKeys.mcpRegistryServer(picked?.source ?? "official", picked?.name),
		queryFn:
			picked === undefined ? skipToken : () => fetchMcpRegistryServer(picked.source, picked.name),
		staleTime: 60_000,
	});
