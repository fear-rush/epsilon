import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { Notice } from "@/components/patterns/status/notice";

/** A SKILL.md pi cannot parse: why, and the file as written. */
export function SkillUnreadable({ error, raw }: { error: string; raw: string }) {
	return (
		<div className="grid gap-field">
			<Notice tone="error">Cannot read SKILL.md: {error}</Notice>
			<CodeEditor
				readOnly
				language="text"
				label="SKILL.md as written"
				value={raw}
				className="h-dialog-body-md"
			/>
		</div>
	);
}
