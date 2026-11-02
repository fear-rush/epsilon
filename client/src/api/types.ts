/**
 * The REST shapes by name, taken from the generated OpenAPI types so the client
 * has no second copy to keep in step with the server.
 */
import type { components } from "./schema.gen";

type Schemas = components["schemas"];

export type BuiltinProvider = Schemas["BuiltinProvider"];
export type DefaultModel = Schemas["DefaultModel"];
export type ExportedSession = Schemas["ExportedSession"];
export type ExportFormat = Schemas["ExportFormat"];
export type McpAutoEnableInput = Schemas["McpAutoEnableInput"];
/** Every live engine's answer, one row per server holding tools or registered. */
export type McpLive = Schemas["McpLive"];
/** One server a live engine can see: it holds tools, or an extension registered it. */
export type McpLiveServer = Schemas["McpLive"]["servers"][number];
/** One tool of a live server: the name a transcript shows and the rule that reaches it. */
export type McpLiveTool = Schemas["McpLiveTool"];
export type McpCommandInput = Schemas["McpCommandInput"];
export type McpCommandResult = Schemas["McpCommandResult"];
export type McpDefaultToolInput = Schemas["McpDefaultToolInput"];
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
export type PackageResourceInput = Schemas["PackageResourceInput"];
export type PackageResources = Schemas["PackageResources"];
export type PackageUpdate = Schemas["PackageUpdate"];
export type PackageView = Schemas["PackageView"];
export type ProjectSessions = Schemas["ProjectSessions"];
export type ProjectStatus = Schemas["ProjectStatus"];
export type ProjectTrustAction = Schemas["ProjectTrustInput"]["action"];
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
export type SettingWriteInput = Schemas["SettingWriteInput"];
export type ForeignSkillView = Schemas["ForeignSkillView"];
export type SkillBundleList = Schemas["SkillBundleList"];
export type SkillDocument = Schemas["SkillDocument"];
export type SkillFile = Schemas["SkillFile"];
export type SkillImportCandidate = Schemas["SkillImportCandidate"];
export type SkillImportCommit = Schemas["SkillImportCommit"];
export type SkillImportReport = Schemas["SkillImportReport"];
export type SkillInput = Schemas["SkillInput"];
export type SkillPathInput = Schemas["SkillPathInput"];
export type SkillRoot = Schemas["SkillRoot"];
export type SkillView = Schemas["SkillView"];
