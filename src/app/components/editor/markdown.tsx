import { lazy, memo, Suspense, useDeferredValue, useMemo } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Code fences are the expensive part; a message without one never loads shiki. */
const MarkdownCodeBlock = lazy(() => import("./markdown-code-block"));

const components = { pre: MarkdownPre };
/** Built once: a new array would make React Markdown reprocess every render. */
const REMARK_PLUGINS = [remarkGfm];

/**
 * Assistant prose.
 *
 * The text is split into top-level blocks (blank lines outside a fence), and each block is a
 * memoized Markdown render. While a reply grows, only its last block re-parses. The whole
 * value goes through `useDeferredValue`, so scrolling stays responsive during a long turn.
 */
export function Markdown({ children }: { children: string }) {
	const deferred = useDeferredValue(children);
	const blocks = useMemo(() => splitBlocks(deferred), [deferred]);

	return (
		<div className="typeset typeset-chat max-w-full min-w-0 wrap-break-word">
			{blocks.map((block, index) => (
				// Blocks are positional within one message; they never reorder.
				// oxlint-disable-next-line react/no-array-index-key
				<MarkdownBlock key={index} text={block} />
			))}
		</div>
	);
}

/** One top-level block. Memoized so an unchanged block is not parsed again. */
const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
	return (
		<ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
			{text}
		</ReactMarkdown>
	);
});

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

// Fenced code arrives as <pre><code>, so read it from the hast node.
function MarkdownPre({ node, children, ...props }: React.ComponentProps<"pre"> & ExtraProps) {
	const element = node?.children[0];

	if (element?.type !== "element" || element.tagName !== "code") {
		return <pre {...props}>{children}</pre>;
	}

	const language = /language-([^\s,]+)/.exec(String(element.properties.className ?? ""))?.[1] ?? "";
	const code = element.children
		.map((child) => (child.type === "text" ? child.value : ""))
		.join("")
		.replace(/\n$/, "");

	return (
		<Suspense fallback={<pre {...props}>{code}</pre>}>
			<MarkdownCodeBlock code={code} language={language} />
		</Suspense>
	);
}
