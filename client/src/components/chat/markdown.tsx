import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarkdownPre } from "@/components/markdown-code";

const components = { pre: MarkdownPre };

/** Assistant prose. Code fences go through MarkdownPre, which highlights them. */
export function Markdown({ children }: { children: string }) {
	return (
		<div className="min-w-0 max-w-full wrap-break-word">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
