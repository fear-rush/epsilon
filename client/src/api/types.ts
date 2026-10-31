/**
 * The REST shapes by name, taken from the generated OpenAPI types so the client
 * has no second copy to keep in step with the server.
 */
import type { components } from "./schema.gen";

type Schemas = components["schemas"];

export type BuiltinProvider = Schemas["BuiltinProvider"];
export type DefaultModel = Schemas["DefaultModel"];
export type McpAutoEnableInput = Schemas["McpAutoEnableInput"];
export type McpEnabledInput = Schemas["McpEnabledInput"];
export type McpInProjectInput = Schemas["McpInProjectInput"];
export type McpOAuthInput = Schemas["McpOAuthInput"];
export type McpReach = Schemas["McpReach"];
export type McpRegistryDetail = Schemas["McpRegistryDetail"];
export type McpRegistryInput = Schemas["McpRegistryInput"];
export type McpRegistryItem = Schemas["McpRegistryItem"];
export type McpRegistryOption = Schemas["McpRegistryOption"];
export type McpRegistrySearch = Schemas["McpRegistrySearch"];
export type McpRegistrySource = Schemas["McpRegistrySource"];
export type McpServerDetail = Schemas["McpServerDetail"];
export type McpServerInput = Schemas["McpServerInput"];
export type McpServerView = Schemas["McpServerView"];
export type FolderListing = Schemas["FolderListing"];
export type ModelOverride = Schemas["ModelOverride"];
export type PackageResources = Schemas["PackageResources"];
export type PackageView = Schemas["PackageView"];
export type ProjectSessions = Schemas["ProjectSessions"];
export type ProjectStatus = Schemas["ProjectStatus"];
export type ProviderDetail = Schemas["ProviderDetail"];
export type ProviderImportInput = Schemas["ProviderImportInput"];
export type ProviderInput = Schemas["ProviderInput"];
export type ProviderLoginAnswer = Schemas["ProviderLoginAnswer"];
export type ProviderLoginQuestion = Schemas["ProviderLoginQuestion"];
export type ProviderLoginSnapshot = Schemas["ProviderLoginSnapshot"];
export type ProviderLoginType = Schemas["ProviderLoginType"];
export type ProviderModelInput = Schemas["ProviderModelInput"];
export type ProviderTestInput = Schemas["ProviderTestInput"];
export type ReasoningCompat = Schemas["ReasoningCompat"];
export type Readiness = Schemas["Readiness"];
export type SessionList = Schemas["SessionList"];
export type SessionSummary = Schemas["SessionSummary"];
export type SettingsSnapshot = Schemas["SettingsSnapshot"];
export type ForeignSkillView = Schemas["ForeignSkillView"];
export type SkillBundleList = Schemas["SkillBundleList"];
export type SkillDocument = Schemas["SkillDocument"];
export type SkillFile = Schemas["SkillFile"];
export type SkillImportCandidate = Schemas["SkillImportCandidate"];
export type SkillImportCommit = Schemas["SkillImportCommit"];
export type SkillImportReport = Schemas["SkillImportReport"];
export type SkillInput = Schemas["SkillInput"];
export type SkillRoot = Schemas["SkillRoot"];
export type SkillView = Schemas["SkillView"];
