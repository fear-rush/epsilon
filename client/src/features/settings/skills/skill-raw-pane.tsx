/**
 * One file in the Raw view: its path, a Preview toggle for markdown, the file's
 * own actions, and the editor or its rendered preview in the same box, so the
 * layout does not move when the view changes.
 */
import { EyeIcon, PencilIcon } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import { Markdown } from "@/components/editor/markdown";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { languageOf } from "./skill-file-tree";

/** A markdown file's text without its YAML frontmatter, which is not prose. */
const withoutFrontmatter = (text: string): string =>
	text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");

/** A link inside the preview must not navigate the app away from unsaved text. */
const keepRelativeLinks = (event: MouseEvent<HTMLDivElement>) => {
	if (!(event.target instanceof Element)) return;
	const href = event.target.closest("a")?.getAttribute("href");
	if (href !== null && href !== undefined && !/^[a-z]+:/i.test(href)) event.preventDefault();
};

export function RawPane({
	path,
	text,
	onChange,
	actions,
}: {
	path: string;
	text: string;
	/** Omit for a read-only file. */
	onChange?: (text: string) => void;
	/** Discard and Save, for an editable file. */
	actions?: ReactNode;
}) {
	const language = languageOf(path);
	const [previewing, setPreviewing] = useState(false);
	const preview = previewing && language === "markdown";
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
			<div className="flex h-8 shrink-0 items-center justify-between gap-2">
				<span className="truncate font-mono text-meta text-muted-foreground">{path}</span>
				<div className="flex items-center gap-2">
					{language === "markdown" && (
						<Tip label={preview ? "Edit" : "Preview"}>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-pressed={preview}
								aria-label={preview ? "Edit" : "Preview"}
								onClick={() => setPreviewing((current) => !current)}
							>
								{preview ? <PencilIcon /> : <EyeIcon />}
							</Button>
						</Tip>
					)}
					{actions}
				</div>
			</div>
			{preview ? (
				// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only cancels link navigation
				<div
					className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card px-6 py-4"
					onClickCapture={keepRelativeLinks}
				>
					<Markdown>{withoutFrontmatter(text)}</Markdown>
				</div>
			) : (
				<CodeEditor
					label={path}
					language={language}
					value={text}
					readOnly={onChange === undefined}
					onChange={onChange}
					className="min-h-0 flex-1"
				/>
			)}
		</div>
	);
}
