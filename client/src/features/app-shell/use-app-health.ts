/**
 * The one answer to "is the app healthy?": the socket, the REST staleness and the
 * REST reachability folded into the single problem the banner shows. A stale build
 * outranks a lost connection, because reconnecting cannot fix it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { OFFLINE } from "@/api/client";
import { useStaleContract } from "@/api/stale-contract";
import { link } from "@/socket/link";
import type { LinkStatus } from "@/socket/link";

export type AppHealth = "ok" | "reconnecting" | "stale";

const subscribeLink = (listener: () => void): (() => void) => link.onStatus(listener);
const linkStatus = (): LinkStatus => link.current;

/** True while any query's latest answer is "the server is not reachable". */
function useRestOffline(): boolean {
	const cache = useQueryClient().getQueryCache();
	return useSyncExternalStore(
		(listener) => cache.subscribe(listener),
		() =>
			cache
				.getAll()
				.some((query) => query.state.status === "error" && query.state.error?.message === OFFLINE),
		() => false,
	);
}

export function useAppHealth(): AppHealth {
	const socket = useSyncExternalStore(subscribeLink, linkStatus, () => "connecting" as const);
	const stale = useStaleContract();
	const offline = useRestOffline();
	if (stale || socket === "blocked") return "stale";
	if (socket === "closed" || offline) return "reconnecting";
	return "ok";
}
