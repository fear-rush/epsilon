import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { useHighlightedCode } from "@/components/editor/highlight";
import {
	CodeBlock,
	CodeBlockActions,
	CodeBlockContent,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "@/components/ui/code-block";

const components = { pre: MarkdownPre };
/** Built once: a new array would make React Markdown reprocess every render. */
const REMARK_PLUGINS = [remarkGfm];

/** Assistant prose. Code fences go through MarkdownPre, which highlights them. */
export function Markdown({ children }: { children: string }) {
	return (
		<div className="typeset typeset-chat min-w-0 max-w-full wrap-break-word">
			<ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
				{children}
			</ReactMarkdown>
		</div>
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

	return <MarkdownCodeBlock code={code} language={language} />;
}

function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
	const lines = useHighlightedCode(code, language);

	return (
		<CodeBlock className="not-typeset mt-(--typeset-flow)">
			<CodeBlockHeader>
				<CodeBlockTitle>{language || "text"}</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockCopyButton value={code} />
				</CodeBlockActions>
			</CodeBlockHeader>
			<CodeBlockContent>
				{lines.map((line, index) => (
					<CodeBlockLine key={index}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}
