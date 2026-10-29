/**
 * The add-or-replace form for an MCP server. The transport decides which target
 * fields exist, so only the selected one is sent; the server schema enforces the
 * same rule.
 */
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import type { McpServerInput } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { saveMcpServer } from "@/lib/api";

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { parsePairs } from "./settings-parse";
import { SettingsBlock, SettingsGroup } from "./settings-section";
import { useSettingsRefresh } from "./settings-refresh";

const transportItems = [
	{ value: "stdio", label: "stdio (a command)" },
	{ value: "http", label: "http (a URL)" },
];

type McpForm = {
	name: string;
	transport: "stdio" | "http";
	command: string;
	args: string;
	env: string;
	url: string;
	headers: string;
	description: string;
	enabled: boolean;
};

const blankForm = (): McpForm => ({
	name: "",
	transport: "stdio",
	command: "",
	args: "",
	env: "",
	url: "",
	headers: "",
	description: "",
	enabled: true,
});

const lines = (text: string): string[] =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");

const pairs = (text: string): Record<string, string> | undefined =>
	text.trim() === "" ? undefined : parsePairs(text);

/** The transport decides which fields exist, so only its own target is sent. */
const inputOf = (values: McpForm): McpServerInput => {
	const common = {
		name: values.name.trim(),
		description: values.description.trim() || undefined,
		enabled: values.enabled,
	};
	if (values.transport === "stdio") {
		return {
			...common,
			transport: "stdio",
			command: values.command.trim(),
			args: lines(values.args),
			env: pairs(values.env),
		};
	}
	return { ...common, transport: "http", url: values.url.trim(), headers: pairs(values.headers) };
};

const targetOf = (form: McpForm): string =>
	form.transport === "stdio" ? form.command.trim() : form.url.trim();

export function McpFormSection() {
	const [form, setForm] = useState<McpForm>(blankForm);
	const refresh = useSettingsRefresh();
	const update = (patch: Partial<McpForm>) => setForm((current) => ({ ...current, ...patch }));

	const save = useMutation({
		mutationFn: async (values: McpForm) => saveMcpServer(inputOf(values)),
		onSuccess: () => {
			setForm(blankForm());
			refresh();
		},
	});

	return (
		<SettingsGroup
			title="Add or replace a server"
			description="A name that already exists is replaced. Disabled servers stay listed."
		>
			<SettingsBlock>
				<form
					className="grid gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate(form);
					}}
				>
					<FieldGroup className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="mcp-name">Name</FieldLabel>
							<Input
								id="mcp-name"
								required
								value={form.name}
								onChange={(event) => update({ name: event.target.value })}
							/>
							<FieldDescription>Letters, digits, dashes and underscores</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="mcp-transport">Transport</FieldLabel>
							<Select
								items={transportItems}
								value={form.transport}
								onValueChange={(value) =>
									update({ transport: value === "http" ? "http" : "stdio" })
								}
							>
								<SelectTrigger id="mcp-transport" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{transportItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
					{form.transport === "stdio" ? (
						<>
							<Field>
								<FieldLabel htmlFor="mcp-command">Command</FieldLabel>
								<Input
									id="mcp-command"
									required
									placeholder="npx"
									value={form.command}
									onChange={(event) => update({ command: event.target.value })}
								/>
								<FieldDescription>One executable, not a shell string</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcp-args">Arguments</FieldLabel>
								<Textarea
									id="mcp-args"
									rows={3}
									value={form.args}
									onChange={(event) => update({ args: event.target.value })}
								/>
								<FieldDescription>One argument per line</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcp-env">Environment</FieldLabel>
								<Textarea
									id="mcp-env"
									rows={2}
									value={form.env}
									onChange={(event) => update({ env: event.target.value })}
								/>
								<FieldDescription>One KEY=VALUE per line</FieldDescription>
							</Field>
						</>
					) : (
						<>
							<Field>
								<FieldLabel htmlFor="mcp-url">URL</FieldLabel>
								<Input
									id="mcp-url"
									required
									placeholder="https://example.com/mcp"
									value={form.url}
									onChange={(event) => update({ url: event.target.value })}
								/>
								<FieldDescription>The streamable HTTP endpoint</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcp-headers">Headers</FieldLabel>
								<Textarea
									id="mcp-headers"
									rows={2}
									value={form.headers}
									onChange={(event) => update({ headers: event.target.value })}
								/>
								<FieldDescription>One KEY=VALUE per line</FieldDescription>
							</Field>
						</>
					)}
					<Field>
						<FieldLabel htmlFor="mcp-description">Description</FieldLabel>
						<Input
							id="mcp-description"
							value={form.description}
							onChange={(event) => update({ description: event.target.value })}
						/>
						<FieldDescription>One sentence: what this server offers</FieldDescription>
					</Field>
					<Field orientation="horizontal">
						<Checkbox
							id="mcp-enabled"
							checked={form.enabled}
							onCheckedChange={(checked) => update({ enabled: checked })}
						/>
						<FieldLabel htmlFor="mcp-enabled">Connect this server on session start</FieldLabel>
					</Field>
					{save.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{save.error.message}</AlertDescription>
						</Alert>
					)}
					<Button
						type="submit"
						className="justify-self-end"
						disabled={save.isPending || form.name.trim() === "" || targetOf(form) === ""}
					>
						{save.isPending ? <Spinner /> : <PlusIcon />}
						Add MCP
					</Button>
				</form>
			</SettingsBlock>
		</SettingsGroup>
	);
}
