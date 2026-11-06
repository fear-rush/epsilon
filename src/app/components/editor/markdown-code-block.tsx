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
import { occurrenceKeys } from "@/lib/occurrence-keys";

/**
 * One fenced block, highlighted. Loaded only when a message contains a fence, so prose
 * renders without shiki in the bundle path.
 */
export default function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
	const lines = useHighlightedCode(code, language);
	// The same trailing-newline rule as the highlighter, so keys and lines pair up.
	const keys = occurrenceKeys((code.endsWith("\n") ? code.slice(0, -1) : code).split("\n"));

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
					<CodeBlockLine key={keys[index]}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}
