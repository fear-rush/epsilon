import { GlobeIcon } from "lucide-react";

import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

import { InlineCitation } from "./inline-citation";

export type Source = {
	readonly url: string;
	readonly title: string;
};

/**
 * The links the agent used for a reply. The line counts them and opens into one row per
 * source; each row's host is an inline citation, so the card that says what the page is
 * opens from the row rather than from a second copy of the link.
 */
export function Sources({ sources }: { sources: ReadonlyArray<Source> }) {
	if (sources.length === 0) return null;
	return (
		<Trace>
			<TraceCollapsible>
				<TraceCollapsibleTrigger>
					<TraceLine>
						<TraceIcon>
							<GlobeIcon />
						</TraceIcon>
						<TraceTitle>
							Used {sources.length} {sources.length === 1 ? "source" : "sources"}
						</TraceTitle>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<Trace>
						{sources.map((source) => (
							<TraceLine key={source.url}>
								<TraceIcon>
									<GlobeIcon />
								</TraceIcon>
								<TraceTitle>{source.title}</TraceTitle>
								<InlineCitation url={source.url} title={source.title} />
							</TraceLine>
						))}
					</Trace>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
