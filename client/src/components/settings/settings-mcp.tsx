/**
 * MCP servers, written to `mcp.json` in the shape pi and other MCP clients
 * share. Names are unique, so adding an existing name replaces it; deleting is
 * confirmed because it removes the server from every session.
 */
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { McpServerInput, McpServerView, SettingsSnapshot } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { deleteMcpServer, saveMcpServer } from "@/lib/api";

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
import { SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from "./settings-section";
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

export function SettingsMcp({ snapshot }: { snapshot: SettingsSnapshot }) {
	const [form, setForm] = useState<McpForm>(blankForm);
	const [pendingDelete, setPendingDelete] = useState<McpServerView | undefined>(undefined);
	const refresh = useSettingsRefresh();
	const update = (patch: Partial<McpForm>) => setForm((current) => ({ ...current, ...patch }));

	const save = useMutation({
		mutationFn: async (values: McpForm) => {
			const input: McpServerInput = {
				name: values.name.trim(),
				transport: values.transport,
				description: values.description.trim() || undefined,
				enabled: values.enabled,
				command: values.command.trim() || undefined,
				args: lines(values.args),
				env: values.env.trim() === "" ? undefined : parsePairs(values.env),
				url: values.url.trim() || undefined,
				headers: values.headers.trim() === "" ? undefined : parsePairs(values.headers),
			};
			await saveMcpServer(input);
		},
		onSuccess: () => {
			setForm(blankForm());
			refresh();
		},
	});
	const remove = useMutation({
		mutationFn: deleteMcpServer,
		onSuccess: () => {
			setPendingDelete(undefined);
			refresh();
		},
	});

	return (
		<SettingsPage title="MCP servers">
			<SettingsGroup title="Configured">
				{snapshot.mcp.length === 0 ? (
					<SettingsRow title="No MCP server" description="Add one below." />
				) : (
					snapshot.mcp.map((server) => (
						<SettingsRow
							key={server.name}
							title={server.name}
							description={[server.transport, server.target, server.description]
								.filter((part) => part !== undefined)
								.join(" · ")}
						>
							{!server.enabled && <Badge variant="warning">Disabled</Badge>}
							<Button
								variant="destructive"
								size="icon-sm"
								aria-label={`Remove ${server.name}`}
								onClick={() => {
									remove.reset();
									setPendingDelete(server);
								}}
							>
								<Trash2Icon />
							</Button>
						</SettingsRow>
					))
				)}
			</SettingsGroup>

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
							disabled={save.isPending || form.name.trim() === ""}
						>
							{save.isPending ? <Spinner /> : <PlusIcon />}
							Add MCP
						</Button>
					</form>
				</SettingsBlock>
			</SettingsGroup>

			<AlertDialog
				open={pendingDelete !== undefined}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							The server is removed from mcp.json, so no session connects to it again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{remove.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{remove.error.message}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (pendingDelete !== undefined) remove.mutate(pendingDelete.name);
							}}
						>
							{remove.isPending && <Spinner data-icon="inline-start" />}
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsPage>
	);
}
