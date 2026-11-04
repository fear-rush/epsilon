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

/**
 * One fenced block, highlighted. Loaded only when a message contains a fence, so prose
 * renders without shiki in the bundle path.
 */
export default function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
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
					// Code lines never reorder; the position is the line number.
					// oxlint-disable-next-line react/no-array-index-key
					<CodeBlockLine key={index}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}
