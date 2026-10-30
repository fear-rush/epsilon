/**
 * Whether any request has shown that this page is older than the server. A
 * request error cannot reach the shell by props, so the query caches report it
 * here and the shell reads it.
 */
import { useSyncExternalStore } from "react";

import { StaleContractError } from "./client";

let stale = false;
const listeners = new Set<() => void>();

/** Records a stale contract when the error is one; any other error is ignored. */
export const reportRequestError = (error: Error): void => {
	if (stale || !(error instanceof StaleContractError)) return;
	stale = true;
	for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const useStaleContract = (): boolean =>
	useSyncExternalStore(
		subscribe,
		() => stale,
		() => false,
	);
