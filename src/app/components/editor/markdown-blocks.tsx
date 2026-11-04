import { lazy, memo, Suspense } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Code fences are the expensive part; a message without one never loads shiki. */
const MarkdownCodeBlock = lazy(() => import("./markdown-code-block"));

/** Built once: a new array would make React Markdown reprocess every render. */
const REMARK_PLUGINS = [remarkGfm];
const components = { pre: MarkdownPre };

/**
 * One top-level block, parsed.
 *
 * This is the parsing half of `markdown.tsx`, loaded on demand: the route renders the
 * transcript without react-markdown, and a chat with no rows never fetches this chunk.
 */
export default memo(function MarkdownBlock({ text }: { text: string }) {
	return (
		<ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
			{text}
		</ReactMarkdown>
	);
});

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
