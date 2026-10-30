/**
 * MCP servers across the two files pi reads: the global `<agent home>/mcp.json`
 * and this deployment's `<project>/.pi/mcp.json`. This module turns both
 * documents into the list and one server's detail, following `loadMcpConfig()`
 * in file order and marking what a project entry replaces or overrides.
 */
import type { McpScope, McpServerDetail, McpServerView } from "shared";

import { entriesOf, type LoadedEntry } from "./mcp-entries";
import { stringMapOf, targetOf } from "./mcp-entry";
import { mcpScopePath, projectMcpPath, readMcpDocument } from "./mcp-file";

const toView = (entry: LoadedEntry): McpServerView => {
	const view: McpServerView = {
		name: entry.name,
		scope: entry.scope,
		target: "",
		enabled: true,
	};
	if (entry.overrideKeys !== undefined) view.overrideKeys = entry.overrideKeys;
	if (!("entry" in entry)) {
		view.invalid = entry.problem;
		view.enabled = entry.enabled ?? true;
		return view;
	}
	const config = entry.config;
	view.target = targetOf(config);
	view.enabled = config.enabled !== false;
	view.transport = entry.transport;
	if (config.description !== undefined) view.description = config.description;
	if (config.exposure !== undefined) view.exposure = config.exposure;
	if (config.timeout !== undefined) view.timeout = config.timeout;
	if (entry.overrideEnabled !== undefined) view.overrideEnabled = entry.overrideEnabled;
	if (entry.replacesGlobal === true) view.replacesGlobal = true;
	if (entry.replacedByProject === true) view.replacedByProject = true;
	if (entry.overriddenByProject === true) view.overriddenByProject = true;
	return view;
};

async function loadEntries(
	home: string,
	projectDir: string,
): Promise<{ entries: LoadedEntry[]; problems: string[] }> {
	const [globalDocument, projectDocument] = await Promise.all([
		readMcpDocument(mcpScopePath("global", home, projectDir)),
		readMcpDocument(projectMcpPath(projectDir)),
	]);
	const problems: string[] = [];
	if (globalDocument.problem !== undefined) problems.push(globalDocument.problem);
	if (projectDocument.problem !== undefined) problems.push(projectDocument.problem);
	return {
		entries: entriesOf(
			globalDocument.document.mcpServers ?? {},
			projectDocument.document.mcpServers ?? {},
		),
		problems,
	};
}

/** The two files as one list: this project's entries first, then the global ones. */
export async function listMcpServers(
	home: string,
	projectDir: string,
): Promise<{ servers: McpServerView[]; error?: string }> {
	const { entries, problems } = await loadEntries(home, projectDir);
	const servers = entries
		.map(toView)
		.sort((left, right) =>
			left.scope === right.scope
				? left.name.localeCompare(right.name)
				: left.scope === "project"
					? -1
					: 1,
		);
	if (problems.length === 0) return { servers };
	return { servers, error: problems.join(" ") };
}

export async function readMcpServer(
	home: string,
	projectDir: string,
	scope: McpScope,
	name: string,
): Promise<McpServerDetail | undefined> {
	const { entries } = await loadEntries(home, projectDir);
	const entry = entries.find((candidate) => candidate.scope === scope && candidate.name === name);
	if (entry === undefined) return undefined;
	const detail: McpServerDetail = {
		...toView(entry),
		envKeys: [],
		headerKeys: [],
		oauthKeys: [],
		toolExposureKeys: [],
	};
	if (!("entry" in entry)) return detail;
	const config = entry.config;
	if (config.command !== undefined) detail.command = config.command;
	if (config.args !== undefined) detail.args = config.args;
	if (config.cwd !== undefined) detail.cwd = config.cwd;
	if (config.url !== undefined) detail.url = config.url;
	if (config.auth !== undefined) detail.authProvider = config.auth.provider;
	detail.envKeys = Object.keys(stringMapOf(config.env));
	detail.headerKeys = Object.keys(stringMapOf(config.headers));
	detail.oauthKeys = Object.keys(config.oauth ?? {});
	detail.toolExposureKeys = Object.keys(config.toolExposure ?? {});
	return detail;
}
