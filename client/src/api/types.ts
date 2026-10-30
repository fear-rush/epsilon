/**
 * The REST shapes by name, taken from the generated OpenAPI types so the client
 * has no second copy to keep in step with the server.
 */
import type { components } from "./schema.gen";

type Schemas = components["schemas"];

export type BuiltinProvider = Schemas["BuiltinProvider"];
export type DefaultModel = Schemas["DefaultModel"];
export type McpEnabledInput = Schemas["McpEnabledInput"];
export type McpInProjectInput = Schemas["McpInProjectInput"];
export type McpServerDetail = Schemas["McpServerDetail"];
export type McpServerInput = Schemas["McpServerInput"];
export type McpServerView = Schemas["McpServerView"];
export type ModelOverride = Schemas["ModelOverride"];
export type PackageView = Schemas["PackageView"];
export type ProviderDetail = Schemas["ProviderDetail"];
export type ProviderImportInput = Schemas["ProviderImportInput"];
export type ProviderInput = Schemas["ProviderInput"];
export type ProviderModelInput = Schemas["ProviderModelInput"];
export type ProviderTestInput = Schemas["ProviderTestInput"];
export type ReasoningCompat = Schemas["ReasoningCompat"];
export type Readiness = Schemas["Readiness"];
export type SessionList = Schemas["SessionList"];
export type SessionSummary = Schemas["SessionSummary"];
export type SettingsSnapshot = Schemas["SettingsSnapshot"];
export type SkillInput = Schemas["SkillInput"];
