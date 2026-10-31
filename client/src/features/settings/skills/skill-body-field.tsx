import type { EditorView } from "@codemirror/view";
import {
	BoldIcon,
	CodeIcon,
	Heading2Icon,
	EyeIcon,
	ItalicIcon,
	LinkIcon,
	ListIcon,
	ListOrderedIcon,
	PaperclipIcon,
	SquareCodeIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/editor/code-editor/code-editor";
import {
	bold,
	bulletList,
	codeBlock,
	fileReference,
	heading,
	inlineCode,
	italic,
	link,
	numberedList,
	type EditorCommand,
} from "@/components/editor/code-editor/markdown-commands";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Markdown } from "@/components/editor/markdown";
import { isRelativeTarget, linkSkillReferences, resolveBodyLinkPath, skillLinkName } from "shared";
import { shortcut } from "@/components/patterns/shortcut";
import { Tip } from "@/components/patterns/tip";
import { bodyDiagnostics } from "./skill-body-checks";

/** `key` is set only for the shortcuts the editor really binds (Mod-b, Mod-i, Mod-k). */
const TOOLS: readonly {
	label: string;
	icon: typeof BoldIcon;
	run: EditorCommand;
	key?: string;
}[] = [
	{ label: "Heading", icon: Heading2Icon, run: heading },
	{ label: "Bold", icon: BoldIcon, run: bold, key: "B" },
	{ label: "Italic", icon: ItalicIcon, run: italic, key: "I" },
	{ label: "Bulleted list", icon: ListIcon, run: bulletList },
	{ label: "Numbered list", icon: ListOrderedIcon, run: numberedList },
	{ label: "Code block", icon: SquareCodeIcon, run: codeBlock },
	{ label: "Inline code", icon: CodeIcon, run: inlineCode },
	{ label: "Link", icon: LinkIcon, run: link, key: "K" },
];

/** What the preview needs to turn a reference into a link. */
export type BodyReferences = {
	/** Opens a file of the skill in the Raw view. */
	openFile: (path: string) => void;
	skillExists: (name: string) => boolean;
	openSkill: (name: string) => void;
};

/**
 * The skill's instructions: the markdown source editor with its formatting
 * toolbar, and one eye button that swaps the editor for a rendered preview. The
 * draft holds the exact text typed; the preview only reads it. Without `onChange`
 * the text is read-only.
 */
export function SkillBodyField({
	id,
	value,
	onChange,
	files,
	references,
}: {
	id: string;
	value: string;
	/** Omitted for a skill Epsilon does not edit: then the editor is read-only. */
	onChange: ((value: string) => void) | undefined;
	/** The skill folder's paths, SKILL.md included; undefined while unknown or for a new skill. */
	files?: readonly string[];
	references?: BodyReferences;
}) {
	const view = useRef<EditorView | null>(null);
	const [preview, setPreview] = useState(false);
	const known = useMemo(() => (files === undefined ? undefined : new Set(files)), [files]);
	const diagnostics = useCallback((text: string) => bodyDiagnostics(text, known), [known]);
	const fileRefs = (files ?? []).filter((path) => path !== "SKILL.md");
	const locked = onChange === undefined || preview;

	const run = (command: EditorCommand) => {
		if (view.current === null) return;
		command(view.current);
		view.current.focus();
	};

	return (
		<div className="grid gap-2">
			<div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
				{TOOLS.map((tool) => (
					<Tip
						key={tool.label}
						label={tool.label}
						keys={tool.key === undefined ? undefined : shortcut(tool.key)}
					>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={tool.label}
							disabled={locked}
							// Keep the editor's selection: a click on a button must not blur it first.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => run(tool.run)}
						>
							<tool.icon />
						</Button>
					</Tip>
				))}
				<FileReferenceMenu
					paths={fileRefs}
					disabled={locked}
					onPick={(label, path) => run(fileReference(label, path))}
				/>
				<Tip label={preview ? "Edit" : "Preview"}>
					<Button
						type="button"
						variant={preview ? "secondary" : "ghost"}
						size="icon-sm"
						className="ml-auto"
						aria-label={preview ? "Edit" : "Preview"}
						aria-pressed={preview}
						onClick={() => setPreview((current) => !current)}
					>
						<EyeIcon />
					</Button>
				</Tip>
			</div>
			<div className={preview ? "hidden" : undefined}>
				<CodeEditor
					id={id}
					label="Instructions"
					language="markdown"
					value={value}
					readOnly={onChange === undefined}
					onChange={onChange}
					diagnostics={diagnostics}
					onView={(next) => {
						view.current = next;
					}}
					placeholder="Write the instructions in markdown."
					className="h-dialog-body-md"
				/>
			</div>
			{preview && <BodyPreview body={value} references={references} />}
		</div>
	);
}

function FileReferenceMenu({
	paths,
	disabled,
	onPick,
}: {
	paths: readonly string[];
	disabled: boolean;
	onPick: (label: string, path: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const unavailable = disabled || paths.length === 0;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tip label="Insert file reference">
				<span className="inline-flex">
					<PopoverTrigger
						disabled={unavailable}
						render={
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Insert file reference"
							/>
						}
					>
						<PaperclipIcon />
					</PopoverTrigger>
				</span>
			</Tip>
			<PopoverContent align="end" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search files…" />
					<CommandList>
						<CommandEmpty>No file matches.</CommandEmpty>
						<CommandGroup heading="Link to a file">
							{paths.map((path) => (
								<CommandItem
									key={path}
									value={path}
									onSelect={() => {
										setOpen(false);
										onPick(path.slice(path.lastIndexOf("/") + 1), path);
									}}
								>
									<span className="truncate font-mono text-meta">{path}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function BodyPreview({
	body,
	references,
}: {
	body: string;
	references: BodyReferences | undefined;
}) {
	const linked = useMemo(
		() => (references === undefined ? body : linkSkillReferences(body, references.skillExists)),
		[body, references],
	);
	return (
		<div
			className="max-h-dialog-body-lg min-h-dialog-body-sm overflow-auto rounded-xl border bg-card p-4 text-body"
			aria-label="Instructions preview"
			// A link to a skill or to a file of this skill stays inside the page.
			onClick={(event) => {
				const anchor = event.target instanceof Element ? event.target.closest("a") : null;
				const href = anchor?.getAttribute("href");
				if (href === null || href === undefined) return;
				const skill = skillLinkName(href);
				if (skill !== undefined) {
					event.preventDefault();
					references?.openSkill(skill);
				} else if (isRelativeTarget(href)) {
					event.preventDefault();
					const path = resolveBodyLinkPath(href);
					if (path !== undefined) references?.openFile(path);
				}
			}}
		>
			{body.trim() === "" ? (
				<p className="text-muted-foreground">Nothing to preview yet.</p>
			) : (
				<Markdown>{linked}</Markdown>
			)}
		</div>
	);
}
