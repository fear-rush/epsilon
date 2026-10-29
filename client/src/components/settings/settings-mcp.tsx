/**
 * MCP servers, written to `mcp.json` in the shape pi and other MCP clients
 * share. Names are unique, so adding an existing name replaces it; deleting is
 * confirmed because it removes the server from every session.
 */
import { useMutation } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { McpServerView, SettingsSnapshot } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteMcpServer } from "@/lib/api";

import { DeleteDialog } from "./delete-dialog";
import { McpFormSection } from "./mcp-form";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-section";
import { useSettingsRefresh } from "./settings-refresh";

export function SettingsMcp({ snapshot }: { snapshot: SettingsSnapshot }) {
	const [pendingDelete, setPendingDelete] = useState<McpServerView | undefined>(undefined);
	const refresh = useSettingsRefresh();
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
								.join(", ")}
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

			<McpFormSection />

			<DeleteDialog
				open={pendingDelete !== undefined}
				title={`Remove ${pendingDelete?.name ?? ""}?`}
				description="The server is removed from mcp.json, so no session connects to it again."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(undefined);
				}}
				onConfirm={() => {
					if (pendingDelete !== undefined) remove.mutate(pendingDelete.name);
				}}
			/>
		</SettingsPage>
	);
}
