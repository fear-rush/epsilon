/**
 * The tab and the open raw file belong to the URL, not to the component: a
 * reload, Back and a shared link all land on the same view. The defaults are
 * omitted, so the usual page keeps a short address.
 */
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import type { SkillTab } from "./skill-modes";

const DEFAULT_RAW_FILE = "SKILL.md";
const ROUTE = "/settings/skills/$name";

export function useSkillPage() {
	const navigate = useNavigate();
	const { name } = useParams({ from: ROUTE });
	const tab = useSearch({ from: ROUTE, select: (search) => search.tab }) ?? "form";
	const rawPath = useSearch({ from: ROUTE, select: (search) => search.file }) ?? DEFAULT_RAW_FILE;

	const go = (patch: { tab?: SkillTab; file?: string }) =>
		void navigate({
			to: ROUTE,
			params: { name },
			search: (previous) => ({ ...previous, ...patch }),
			replace: true,
		});

	return {
		tab,
		rawPath,
		setTab: (next: SkillTab) => go({ tab: next === "form" ? undefined : next }),
		setRawPath: (next: string) => go({ file: next === DEFAULT_RAW_FILE ? undefined : next }),
		/** Open a reference in the Raw tab in one navigation, so the two never race. */
		openRawFile: (next: string) =>
			go({ tab: "raw", file: next === DEFAULT_RAW_FILE ? undefined : next }),
	};
}
