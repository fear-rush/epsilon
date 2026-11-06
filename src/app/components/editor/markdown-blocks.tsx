import { Option, Schema } from "effect";
import { type ReactNode, lazy, memo, Suspense } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { InlineCitation } from "@/components/ai-elements/inline-citation";

/** Code fences are the expensive part; a message without one never loads shiki. */
const MarkdownCodeBlock = lazy(() => import("./markdown-code-block"));

/** Built once: a new array would make React Markdown reprocess every render. */
const REMARK_PLUGINS = [remarkGfm];
const PLAIN_COMPONENTS = { pre: MarkdownPre };
const CITATION_COMPONENTS = { a: MarkdownLink, pre: MarkdownPre };

/** A React child that is text, decoded with the schema language the app already uses. */
const textOf = (child: ReactNode): string | undefined => {
	const decoded = Schema.decodeUnknownOption(Schema.String)(child);
	return Option.isSome(decoded) ? decoded.value : undefined;
};

/** The words of a link, when they are text rather than nested elements. */
const linkText = (children: ReactNode): string | undefined => {
	const single = textOf(children);
	if (single !== undefined) return single.trim() === "" ? undefined : single;
	if (!Array.isArray(children)) return undefined;
	const parts = children.map(textOf);
	if (parts.some((part) => part === undefined)) return undefined;
	const text = parts.filter((part): part is string => part !== undefined).join("");
	return text.trim() === "" ? undefined : text;
};

/**
 * One top-level block, parsed.
 *
 * This is the parsing half of `markdown.tsx`, loaded on demand: the route renders the
 * transcript without react-markdown, and a chat with no rows never fetches this chunk.
 */
export default memo(function MarkdownBlock({
	text,
	links = "plain",
}: {
	text: string;
	links?: "plain" | "citation";
}) {
	return (
		<ReactMarkdown
			remarkPlugins={REMARK_PLUGINS}
			components={links === "citation" ? CITATION_COMPONENTS : PLAIN_COMPONENTS}
		>
			{text}
		</ReactMarkdown>
	);
});

/**
 * An external link in a reply is an inline citation: the chip names its host, and the
 * card names the page and carries the link. A relative or hash link is navigation, so it
 * stays an ordinary link.
 */
function MarkdownLink({
	href,
	title,
	children,
	node: _node,
	...props
}: React.ComponentProps<"a"> & ExtraProps) {
	const text = linkText(children);
	if (href !== undefined && text !== undefined && /^https?:\/\//.test(href)) {
		return <InlineCitation url={href} title={text} description={title} />;
	}
	return (
		<a href={href} {...props}>
			{children}
		</a>
	);
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
