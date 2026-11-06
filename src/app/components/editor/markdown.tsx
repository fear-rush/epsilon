import { lazy, Suspense, useDeferredValue } from "react";

/** The parsing half, fetched when a message first renders. */
const MarkdownBlock = lazy(() => import("./markdown-blocks"));

/**
 * Assistant prose.
 *
 * The text is split into top-level blocks (blank lines outside a fence), and each block is a
 * memoized Markdown render. While a reply grows, only its last block re-parses. The whole
 * value goes through `useDeferredValue`, so scrolling stays responsive during a long turn.
 *
 * The block renderer is a lazy chunk: the route never loads react-markdown for a chat with
 * no rows, and the plain text stands in until the parser arrives. `links="citation"` turns
 * an external link into an inline citation; a preview keeps the ordinary link.
 */
export function Markdown({
	children,
	links = "plain",
}: {
	children: string;
	links?: "plain" | "citation";
}) {
	const deferred = useDeferredValue(children);
	const blocks = splitBlocks(deferred);

	return (
		<div className="typeset typeset-chat max-w-full min-w-0 wrap-break-word">
			<Suspense fallback={<p className="whitespace-pre-wrap">{deferred}</p>}>
				{blocks.map((block, index) => (
					// Blocks are positional within one message; they never reorder.
					// oxlint-disable-next-line react/no-array-index-key -- blocks are positional within one message and never reorder
					<MarkdownBlock key={index} links={links} text={block} />
				))}
			</Suspense>
		</div>
	);
}

/**
 * Top-level blocks of a message: blank lines outside a code fence. A fence is opened by a
 * run of backticks or tildes and closed by a run of the same character at least as long.
 */
export function splitBlocks(text: string): ReadonlyArray<string> {
	const blocks: string[] = [];
	let current: string[] = [];
	let fence: string | undefined;

	for (const line of text.split("\n")) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker !== undefined) {
			if (fence === undefined) {
				fence = marker;
			} else if (marker[0] === fence[0] && marker.length >= fence.length) {
				fence = undefined;
			}
		}
		if (fence === undefined && line.trim() === "" && current.length > 0) {
			blocks.push(current.join("\n"));
			current = [];
			continue;
		}
		current.push(line);
	}

	if (current.length > 0) blocks.push(current.join("\n"));
	return blocks.filter((block) => block.trim() !== "");
}
