import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { FieldError } from "@/components/ui/field";

import type { McpRawDraft } from "./mcp-raw-draft";

/** The JSON editor fills the page body, so the page itself does not scroll. */
export function McpRawPane({ raw }: { raw: McpRawDraft }) {
	return (
		<>
			<CodeEditor
				value={raw.text}
				language="json"
				label="MCP server JSON"
				readOnly={raw.query.isPending}
				className="min-h-0 flex-1"
				onChange={raw.edit}
			/>
			{raw.problem !== undefined && <FieldError>{raw.problem}</FieldError>}
			{raw.query.error !== null && <FieldError>{raw.query.error.message}</FieldError>}
		</>
	);
}
