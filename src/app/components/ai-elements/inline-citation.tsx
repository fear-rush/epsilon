import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/** A URL's host without its protocol or `www.`, for the chip a reader sees. */
const hostOf = (url: string): string => {
	const host = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
	if (host === undefined || host === "") return url;
	return host.replace(/^www\./, "");
};

/**
 * A source in the sentence that opens on hover. The chip names the host; the card names
 * the page and carries the link, so a long URL never sits in the prose.
 */
export function InlineCitation({
	url,
	title,
	description,
}: {
	url: string;
	title: string;
	description?: string | undefined;
}) {
	const host = hostOf(url);
	return (
		<HoverCard>
			<HoverCardTrigger
				delay={10}
				closeDelay={100}
				render={
					<Button variant="secondary" size="xs" className="h-5 rounded-full px-2 text-meta" />
				}
			>
				{host}
			</HoverCardTrigger>
			<HoverCardContent side="top" align="start" className="flex w-64 flex-col gap-1 rounded-xl">
				<div className="font-medium">{title}</div>
				{description === undefined ? undefined : (
					<p className="text-meta text-muted-foreground">{description}</p>
				)}
				<a
					href={url}
					target="_blank"
					rel="noreferrer"
					className="text-meta text-muted-foreground underline-offset-4 hover:underline"
				>
					{host}
					<span className="sr-only"> (opens in a new tab)</span>
				</a>
			</HoverCardContent>
		</HoverCard>
	);
}
