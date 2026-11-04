import { Layer } from "effect";

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
import { ConversationHandlersLive } from "./conversation/handlers.ts";
import { DiagnosticsHandlersLive } from "./diagnostics/handlers.ts";
import { HandshakeHandlersLive } from "./handshake.ts";
import { SessionsHandlersLive } from "./sessions/handlers.ts";

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
