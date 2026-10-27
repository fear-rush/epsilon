import { MarkdownPre } from "@/components/markdown-code";
import { type TextMessagePart } from "shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TextPart({ part }: { part: TextMessagePart }) {
	return (
		<div className="typeset typeset-docs">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: MarkdownPre }}>
				{part.text}
			</ReactMarkdown>
		</div>
	);
}
