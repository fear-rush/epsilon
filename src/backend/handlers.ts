import { Layer } from "effect";

import { GeneralRpcs } from "#protocol/config/general";
import { McpRpcs } from "#protocol/config/mcp";
import { McpRegistryRpcs } from "#protocol/config/mcp-registry";
import { PackageRpcs } from "#protocol/config/packages";
import { ProjectRpcs } from "#protocol/config/projects";
import { ProviderLoginRpcs, ProviderRpcs } from "#protocol/config/providers";
import { ReadinessRpcs } from "#protocol/config/readiness";
import { ConfigRpcs } from "#protocol/config/settings";
import { SkillImportRpcs } from "#protocol/config/skill-import";
import { SkillRpcs } from "#protocol/config/skills";
import { ContextRpcs } from "#protocol/context";
import { DiagnosticsRpcs } from "#protocol/diagnostics";
import { HandshakeRpcs } from "#protocol/rpc";

import { GeneralHandlersLive } from "./config/general/handlers.ts";
import { ConfigHandlersLive } from "./config/handlers.ts";
import { McpRegistryHandlersLive } from "./config/mcp-registry/handlers.ts";
import { McpHandlersLive } from "./config/mcp/handlers.ts";
import { PackageHandlersLive } from "./config/packages/handlers.ts";
import { ProjectHandlersLive } from "./config/projects/handlers.ts";
import { ProvidersHandlersLive } from "./config/providers/handlers.ts";
import { ProviderLoginHandlersLive } from "./config/providers/login-handlers.ts";
import { ReadinessHandlersLive } from "./config/readiness/handlers.ts";
import { SkillImportHandlersLive } from "./config/skill-import/handlers.ts";
import { SkillHandlersLive } from "./config/skills/handlers.ts";
import { ContextHandlersLive } from "./context/handlers.ts";
import { DiagnosticsHandlersLive } from "./diagnostics/handlers.ts";
import { HandshakeGate, HandshakeHandlersLive } from "./handshake.ts";

/**
 * The socket's whole vocabulary.
 *
 * Every group is declared beside the handler that answers it; this file only names them
 * once so the page and the server speak the same set. The handshake gate is applied here,
 * to every procedure, because a group that forgot it would be a hole in G3.
 */
export const EpsilonRpcs = HandshakeRpcs.merge(
	GeneralRpcs,
	ConfigRpcs,
	ProjectRpcs,
	ProviderRpcs,
	ProviderLoginRpcs,
	McpRpcs,
	McpRegistryRpcs,
	ReadinessRpcs,
	PackageRpcs,
	SkillRpcs,
	SkillImportRpcs,
	ContextRpcs,
	DiagnosticsRpcs,
).middleware(HandshakeGate);

export const EpsilonHandlersLive = Layer.mergeAll(
	HandshakeHandlersLive,
	GeneralHandlersLive,
	ConfigHandlersLive,
	ProjectHandlersLive,
	ProvidersHandlersLive,
	ProviderLoginHandlersLive,
	McpHandlersLive,
	McpRegistryHandlersLive,
	ReadinessHandlersLive,
	PackageHandlersLive,
	SkillHandlersLive,
	SkillImportHandlersLive,
	ContextHandlersLive,
	DiagnosticsHandlersLive,
);
