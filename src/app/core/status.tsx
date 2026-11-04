import { queryOptions, useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { call, link } from "@/core/runtime";
import { cn } from "@/lib/cn";

/**
 * Readiness, the app's health, and the one status line they share.
 *
 * Connection and version problems, a chat that cannot continue, and whether a turn can run
 * at all are three answers to the same question a reader has at the top of the page. They
 * report into one region instead of each drawing a banner, so the page never argues with
 * itself and there is one element to announce.
 *
 * A report is plain data, not a node: two reports with the same words must not re-render
 * the provider forever.
 */

const READINESS_REFRESH_MS = 15_000;

/** Whether Epsilon can run a turn, asked of pi's own model runtime on the server. */
export const readinessQuery = queryOptions({
	queryKey: ["config", "readiness"],
	queryFn: ({ signal }) => call((client) => client["settings.readiness.read"](), { signal }),
	refetchInterval: READINESS_REFRESH_MS,
});

export function useReadiness() {
	return useQuery(readinessQuery);
}

export type StatusValue = {
	readonly text: string;
	readonly tone: "warning" | "destructive";
	/** The label of the button that fixes it, when the reporter knows one. */
	readonly action?: string;
};

type StatusApi = {
	readonly reports: ReadonlyMap<string, StatusValue>;
	readonly set: (id: string, value: StatusValue | undefined) => void;
	/** The reporter's handler for its action, kept out of the report to stay stable. */
	readonly action: (id: string) => (() => void) | undefined;
	readonly actions: React.RefObject<Map<string, () => void>>;
};

const StatusContext = createContext<StatusApi | undefined>(undefined);

/** The same empty map every render, so a page without a provider is not a new value. */
const NO_REPORTS: ReadonlyMap<string, StatusValue> = new Map();

export function StatusProvider({ children }: { children: ReactNode }) {
	const [reports, setReports] = useState<ReadonlyMap<string, StatusValue>>(new Map());

	const set = useCallback((id: string, value: StatusValue | undefined) => {
		setReports((previous) => {
			const next = new Map(previous);
			if (value === undefined) next.delete(id);
			else next.set(id, value);
			return next;
		});
	}, []);

	const actions = useRef(new Map<string, () => void>());
	const action = useCallback((id: string) => actions.current.get(id), []);
	const api = useMemo<StatusApi>(() => ({ action, actions, reports, set }), [action, reports, set]);
	return <StatusContext.Provider value={api}>{children}</StatusContext.Provider>;
}

/** A feature's claim on the status line, released when the feature unmounts. */
export function useReportStatus(
	id: string,
	value: StatusValue | undefined,
	onAction?: () => void,
	options?: { readonly keep?: boolean },
): void {
	const keep = options?.keep ?? false;
	const api = useContext(StatusContext);
	const set = api?.set;
	useEffect(() => {
		const actions = api?.actions.current;
		if (actions === undefined) return;
		if (onAction === undefined) actions.delete(id);
		else actions.set(id, onAction);
	}, [api, id, onAction]);

	const text = value?.text;
	const tone = value?.tone;
	const action = value?.action;

	useEffect(() => {
		let next: StatusValue | undefined;
		if (text !== undefined) {
			next = { text, tone: tone ?? "warning" };
			if (action !== undefined) next = { ...next, action };
		}
		set?.(id, next);
		return () => {
			if (!keep) set?.(id, undefined);
		};
	}, [id, set, text, tone, action, keep]);
}

export function useStatus(): StatusApi | undefined {
	return useContext(StatusContext);
}

export type AppHealth = "ok" | "reconnecting" | "stale";

/**
 * The socket, plus whether this page is still the one the server serves.
 *
 * The runtime's probe closes the link when the server stops answering, so one answer drives
 * the banner and the wait a command does.
 */
export function useAppHealth(): AppHealth {
	const current = useSyncExternalStore(link.subscribe, link.current, link.current);
	if (current.outOfDate) return "stale";
	return current.socket === "open" ? "ok" : "reconnecting";
}

const TONE = {
	destructive: "border-destructive/40 bg-destructive/5 text-destructive",
	warning: "border-warning/40 bg-warning/5 text-warning-foreground",
} as const;

/**
 * The one status line above every surface.
 *
 * A stale page outranks a lost connection, because reconnecting cannot fix it; a chat that
 * cannot continue outranks readiness, because it is about what the reader is doing. When
 * nothing is wrong it says so, quietly, rather than disappearing.
 */
export function AppStatus() {
	const health = useAppHealth();
	const readiness = useReadiness();
	const status = useStatus();
	const reports = status?.reports ?? NO_REPORTS;

	if (health === "stale") {
		return (
			<Strip tone="destructive" action={<Reload />}>
				Epsilon was updated. Reload to continue.
			</Strip>
		);
	}
	if (health === "reconnecting") {
		return (
			<Strip tone="warning">
				<span className="inline-flex items-center gap-2">
					<LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
					Reconnecting to the server…
				</span>
			</Strip>
		);
	}

	const firstId = Array.from(reports.keys())[0];
	const report = firstId === undefined ? undefined : reports.get(firstId);
	if (firstId !== undefined && report !== undefined) {
		return (
			<Strip
				tone={report.tone}
				action={
					report.action === undefined ? undefined : (
						<Button size="xs" variant="outline" onClick={() => status?.action(firstId)?.()}>
							{report.action}
						</Button>
					)
				}
			>
				{report.text}
			</Strip>
		);
	}

	if (readiness.data !== undefined && !readiness.data.ready) {
		return <Strip tone="warning">{`Not ready: ${readiness.data.detail}`}</Strip>;
	}

	return (
		<output className="block border-b px-page py-1 text-meta text-muted-foreground">Ready</output>
	);
}

function Strip({
	tone,
	action,
	children,
}: {
	tone: keyof typeof TONE;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<output
			className={cn(
				"flex w-full shrink-0 animate-enter-fade items-center justify-center gap-3 border-b px-4 py-1.5 text-meta",
				TONE[tone],
			)}
		>
			<span className="min-w-0 truncate">{children}</span>
			{action}
		</output>
	);
}

function Reload() {
	return (
		<Button size="xs" variant="outline" onClick={() => window.location.reload()}>
			Reload
		</Button>
	);
}
