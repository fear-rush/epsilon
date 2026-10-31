/**
 * Step 1 of the add dialog: how the server is described, and the few fields that
 * way needs. Every tab fills the same fixed body, so nothing moves between them.
 * The paste box previews what it found, with a checkbox per server
 * when there are several; that list is a creation list, not a settings row.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { UseQueryResult } from "@tanstack/react-query";
import type { McpRegistryDetail } from "@/api/types";
import { cn } from "@/lib/cn";

import { nameProblemOf } from "./mcp-import";
import { McpRegistryBrowser } from "./mcp-registry-browser";
import type { RegistryDraft } from "./mcp-registry";
import type { AddMode, PasteState, SourceDraft } from "./mcp-import";

const MODES: { value: AddMode; title: string }[] = [
	{ value: "registry", title: "Registry" },
	{ value: "paste", title: "Paste" },
	{ value: "command", title: "Command" },
	{ value: "url", title: "URL" },
];

export function NameField({
	id,
	value,
	touched,
	onChange,
}: {
	id: string;
	value: string;
	touched: boolean;
	onChange: (value: string) => void;
}) {
	const problem = touched ? nameProblemOf(value) : undefined;
	return (
		<Field data-invalid={problem !== undefined}>
			<FieldLabel htmlFor={id}>Name</FieldLabel>
			<Input
				id={id}
				value={value}
				placeholder="e.g. filesystem"
				aria-invalid={problem !== undefined}
				onChange={(event) => onChange(event.target.value)}
			/>
			{problem !== undefined && <FieldError>{problem}</FieldError>}
		</Field>
	);
}

function PastePreview({
	state,
	source,
	onChange,
}: {
	state: PasteState;
	source: SourceDraft;
	onChange: (patch: Partial<SourceDraft>) => void;
}) {
	if (state.kind === "empty") return null;
	if (state.kind === "error") return <p className="text-meta text-destructive">{state.error}</p>;
	const many = state.entries.length > 1;
	return (
		<div className="grid gap-3">
			{state.needsName && (
				<NameField
					id="mcp-add-paste-name"
					value={source.pasteName}
					touched={source.pasteName !== ""}
					onChange={(pasteName) => onChange({ pasteName })}
				/>
			)}
			<ul className="divide-y rounded-xl border">
				{state.entries.map((entry) => {
					const addable = entry.server !== undefined;
					const checked = addable && !source.skipped.has(entry.id);
					return (
						<li key={entry.id}>
							<label
								className={cn(
									"flex items-start gap-3 px-3 py-2",
									addable ? "cursor-pointer" : "opacity-70",
								)}
							>
								{many && (
									<Checkbox
										className="mt-0.5"
										checked={checked}
										disabled={!addable}
										aria-label={`Add ${entry.name || "this server"}`}
										onCheckedChange={(next) => {
											const skipped = new Set(source.skipped);
											if (next) skipped.delete(entry.id);
											else skipped.add(entry.id);
											onChange({ skipped });
										}}
									/>
								)}
								<span className="grid min-w-0 gap-0.5">
									<span className="truncate text-body font-medium">
										{entry.name === "" ? "Unnamed server" : entry.name}
									</span>
									<span className="truncate font-mono text-code text-muted-foreground">
										{entry.server === undefined
											? ""
											: entry.server.transport === "stdio"
												? [entry.server.command, ...entry.server.args].join(" ")
												: entry.server.url}
									</span>
									{entry.problem !== undefined && (
										<span className="text-meta text-destructive">{entry.problem}</span>
									)}
									{entry.ignored.length > 0 && (
										<span className="text-meta text-muted-foreground">
											Not carried over: {entry.ignored.join(", ")}
										</span>
									)}
								</span>
							</label>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

/** Every tab scrolls inside the dialog's fixed body; the ring gutter keeps focus rings whole. */
const PANEL = "-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1";

export function McpAddSource({
	source,
	paste,
	registry,
	registryDetail,
	onChange,
	onRegistry,
}: {
	source: SourceDraft;
	paste: PasteState;
	registry: RegistryDraft;
	registryDetail: UseQueryResult<McpRegistryDetail>;
	onChange: (patch: Partial<SourceDraft>) => void;
	onRegistry: (patch: Partial<RegistryDraft>) => void;
}) {
	return (
		<Tabs
			value={source.mode}
			className="h-full gap-3"
			onValueChange={(value) => {
				const mode = MODES.find((candidate) => candidate.value === value);
				if (mode !== undefined) onChange({ mode: mode.value });
			}}
		>
			<TabsList aria-label="How to add the server" className="w-full">
				{MODES.map((mode) => (
					<TabsTrigger key={mode.value} value={mode.value}>
						{mode.title}
					</TabsTrigger>
				))}
			</TabsList>

			<TabsContent value="registry" className="-mx-1 min-h-0 flex-1 overflow-hidden px-1 py-1">
				<McpRegistryBrowser draft={registry} detail={registryDetail} onChange={onRegistry} />
			</TabsContent>

			<TabsContent value="paste" className={PANEL}>
				<FieldGroup className="gap-4">
					<Field>
						<FieldLabel htmlFor="mcp-add-paste">Config</FieldLabel>
						<Textarea
							id="mcp-add-paste"
							rows={7}
							spellCheck={false}
							className="font-mono text-code"
							placeholder={
								'{ "mcpServers": { "files": { "command": "npx", "args": ["-y", "…"] } } }'
							}
							value={source.paste}
							onChange={(event) => onChange({ paste: event.target.value, skipped: new Set() })}
						/>
					</Field>
					<PastePreview state={paste} source={source} onChange={onChange} />
				</FieldGroup>
			</TabsContent>

			<TabsContent value="command" className={PANEL}>
				<FieldGroup className="gap-4">
					<NameField
						id="mcp-add-name"
						value={source.name}
						touched={source.name !== ""}
						onChange={(name) => onChange({ name })}
					/>
					<Field>
						<FieldLabel htmlFor="mcp-add-command">Command</FieldLabel>
						<Input
							id="mcp-add-command"
							placeholder="npx"
							value={source.command}
							onChange={(event) => onChange({ command: event.target.value })}
						/>
						<FieldDescription>One executable, not a shell string</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-add-args">Arguments</FieldLabel>
						<Textarea
							id="mcp-add-args"
							rows={3}
							value={source.args}
							onChange={(event) => onChange({ args: event.target.value })}
						/>
						<FieldDescription>One argument per line</FieldDescription>
					</Field>
				</FieldGroup>
			</TabsContent>

			<TabsContent value="url" className={PANEL}>
				<FieldGroup className="gap-4">
					<NameField
						id="mcp-add-name"
						value={source.name}
						touched={source.name !== ""}
						onChange={(name) => onChange({ name })}
					/>
					<Field>
						<FieldLabel htmlFor="mcp-add-url">URL</FieldLabel>
						<Input
							id="mcp-add-url"
							placeholder="https://example.com/mcp"
							value={source.url}
							onChange={(event) => onChange({ url: event.target.value })}
						/>
					</Field>
				</FieldGroup>
			</TabsContent>
		</Tabs>
	);
}
