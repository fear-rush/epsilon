import { Layer } from "effect";

import { ConversationHandlersLive } from "./conversation/handlers.ts";
import { DiagnosticsHandlersLive } from "./diagnostics/handlers.ts";
import { HandshakeHandlersLive } from "./handshake.ts";
import { SessionsHandlersLive } from "./sessions/handlers.ts";
import { ContextHandlersLive } from "./settings/context/handlers.ts";
import { GeneralHandlersLive } from "./settings/general/handlers.ts";
import { ConfigHandlersLive } from "./settings/handlers.ts";
import { McpRegistryHandlersLive } from "./settings/mcp-registry/handlers.ts";
import { McpHandlersLive } from "./settings/mcp/handlers.ts";
import { PackageHandlersLive } from "./settings/packages/handlers.ts";
import { ProjectHandlersLive } from "./settings/projects/handlers.ts";
import { ProvidersHandlersLive } from "./settings/providers/handlers.ts";
import { ProviderLoginHandlersLive } from "./settings/providers/login-handlers.ts";
import { ReadinessHandlersLive } from "./settings/readiness/handlers.ts";
import { SkillImportHandlersLive } from "./settings/skill-import/handlers.ts";
import { SkillHandlersLive } from "./settings/skills/handlers.ts";

/** Every group's handlers, beside the group each answers. */
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
	SessionsHandlersLive,
	ConversationHandlersLive,
);
