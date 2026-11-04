# Parity ledger

Every row is something `main` (`48226bb`) has that this branch must have, 1:1, before
it merges. Rules and procedure: [03-port.md](03-port.md); slice S1 is
[02-feedback.md](02-feedback.md). Deleted with `docs/plan/` at the merge.

Tick a row (`[x]`) only in the commit that finishes it, and add that commit's subject to
the row's last cell. "Branch today" was generated on 2026-11-04 from `main`'s exported
names; it is a hint, not a verdict. A file that exists on the branch stays unticked until
`bun run parity` and the screenshots pass. Branch paths here are from before
[phase 1](01-structure.md); main paths never change.

## Routes

URLs are part of the UI: a bookmark to main's page opens the same page here.

| Done | main route                                                                          | Branch today           |
| ---- | ----------------------------------------------------------------------------------- | ---------------------- |
| [ ]  | `/`                                                                                 | exists                 |
| [ ]  | `/sessions/$sessionId`                                                              | exists                 |
| [ ]  | `/settings`                                                                         | exists                 |
| [ ]  | `/settings/general`                                                                 | exists                 |
| [ ]  | `/settings/context`                                                                 | exists (flat file)     |
| [ ]  | `/settings/context/$section`                                                        | **missing**            |
| [ ]  | `/settings/mcp`                                                                     | exists (145-line stub) |
| [ ]  | `/settings/mcp/$scope/$name`                                                        | **missing**            |
| [ ]  | `/settings/packages`, `/settings/packages/$scope/$source`                           | exists                 |
| [ ]  | `/settings/providers`, `/settings/providers/new`, `/settings/providers/$providerId` | exists                 |
| [ ]  | `/settings/skills`, `/settings/skills/new`, `/settings/skills/$name`                | exists                 |

Branch-only routes `/settings/projects` and `/settings/diagnostics` stay; they must use
main's settings layout and patterns, and they get rows in S8 when touched.

## Server and engine gaps

What main's UI calls that the branch has no call or command for. Add each one in the
slice that needs it, through `src/protocol/` and a handler (AGENTS.md, "Add to a root").
Rows marked _verify_ may exist under another name: find it before adding one.

| Done | main                                                                          | For slice | Branch today                             |
| ---- | ----------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| [x]  | chat `bash`, `abort_bash`                                                     | S2        | `feat(conversation): the run status`     |
| [ ]  | chat `autocomplete`                                                           | S2        | **missing**                              |
| [x]  | chat `cancel_retry`, `set_auto_retry`                                         | S2        | `feat(conversation): the run controls`   |
| [x]  | chat `set_auto_compaction`, `abort_compaction`                                | S2        | `feat(conversation): the run controls`   |
| [x]  | chat `clear_queue`                                                            | S2        | `feat(conversation): the run controls`   |
| [x]  | chat `set_label`                                                              | S2        | `feat(conversation): the run controls`   |
| [x]  | chat `set_hide_thinking`                                                      | S2        | `feat(conversation): the run controls`   |
| [ ]  | chat `set_tree_filter_mode`                                                   | S2        | verify (a setting exists in general)     |
| [ ]  | chat `reload`, `reload_session`                                               | S2        | verify (`reloadFromDisk`)                |
| [x]  | chat `set_coding_tools`                                                       | S2        | `feat(conversation): the composer menus` |
| [ ]  | `POST /api/sessions/{id}/export`                                              | S2        | **missing**                              |
| [ ]  | `POST /api/sessions/{id}/clone`                                               | S2        | verify                                   |
| [ ]  | `POST /api/sessions/{id}/move`                                                | S3        | verify                                   |
| [ ]  | `DELETE /api/projects/sessions` (delete a project's chats)                    | S3        | **missing**                              |
| [ ]  | `PUT /api/settings/mcp/default-tool`                                          | S4        | **missing**                              |
| [ ]  | `POST /api/settings/mcp/command`                                              | S4        | **missing**                              |
| [ ]  | `POST /api/settings/providers/test`                                           | S5        | **missing**                              |
| [ ]  | `POST /api/settings/providers/{id}/logout` (through `ModelRuntime.logout()`)  | S5        | **missing**                              |
| [ ]  | `POST /api/settings/skills/folders/link`, `…/unlink`                          | S6        | verify                                   |
| [ ]  | `GET /api/settings/skills/listed-files`, `POST …/listed-file`, `PUT …/listed` | S6        | verify                                   |
| [ ]  | `PUT /api/settings/skills/paths`, `DELETE …/paths`                            | S6        | verify                                   |

## Client files

## S1 Feedback system (status line, route error, not found, notices, confirms)

| Done | main file (`client/src/…`)                       | Lines | Branch today                   | Missing exports         |
| ---- | ------------------------------------------------ | ----- | ------------------------------ | ----------------------- |
| [x]  | `app/route-error.tsx`                            | 26    | on `StatusView`, per layout    |                         |
| [x]  | `app/route-not-found.tsx`                        | 25    | on `StatusView`, per layout    |                         |
| [x]  | `app/route-pending.tsx`                          | 10    | per layout (`LoadingState`)    |                         |
| [ ]  | `components/patterns/dialog/confirm-dialogs.tsx` | 210   | exists, changed (8 lines)      |                         |
| [x]  | `components/patterns/status/app-banner.tsx`      | 38    | deleted                        | replaced by `AppStatus` |
| [ ]  | `components/patterns/status/error-view.ts`       | 59    | exists, changed (51 lines)     |                         |
| [ ]  | `components/patterns/status/inline-status.tsx`   | 23    | identical                      |                         |
| [ ]  | `components/patterns/status/loading-state.tsx`   | 11    | exists, changed (15 lines)     |                         |
| [ ]  | `components/patterns/status/notice.tsx`          | 45    | identical                      |                         |
| [ ]  | `components/patterns/status/status-tone.ts`      | 15    | identical                      |                         |
| [ ]  | `components/patterns/status/status-view.tsx`     | 34    | exists, changed (2 lines)      |                         |
| [ ]  | `components/ui/alert-dialog.tsx`                 | 160   | exists, changed (8 lines)      |                         |
| [ ]  | `components/ui/alert.tsx`                        | 77    | exists, changed (5 lines)      |                         |
| [x]  | `features/app-shell/app-health-banner.tsx`       | 32    | **missing**                    | replaced by `AppStatus` |
| [ ]  | `features/app-shell/use-app-health.ts`           | 39    | exists elsewhere (names found) |                         |

## S2 Chat (session view, composer, transcript, branches, dialogs)

| Done | main file (`client/src/…`)                           | Lines | Branch today                                  | Missing exports                                               |
| ---- | ---------------------------------------------------- | ----- | --------------------------------------------- | ------------------------------------------------------------- |
| [ ]  | `features/conversation/branch-items.tsx`             | 71    | **missing**                                   | `BranchItems`                                                 |
| [ ]  | `features/conversation/branch-rules.ts`              | 7     | **missing**                                   | `branchBlocked`                                               |
| [x]  | `features/conversation/chat-bar.tsx`                 | 31    | `feat(conversation): main's chat bar`         |                                                               |
| [ ]  | `features/conversation/compact-context-dialog.tsx`   | 78    | **missing**                                   | `CompactContextDialog`                                        |
| [x]  | `features/conversation/composer/attachments.tsx`     | 49    | `feat(conversation): the composer's images`   | `Attachment`, `AttachmentStrip`                               |
| [ ]  | `features/conversation/composer/builtin-commands.ts` | 227   | **missing**                                   | `ComposerCommandContext`, `RouteTarget`, `runComposerCommand` |
| [x]  | `features/conversation/composer/cache-warming.tsx`   | 50    | `feat(conversation): the composer's readings` | `CacheWarmingState`                                           |
| [ ]  | `features/conversation/composer/composer.tsx`        | 669   | exists elsewhere (names found)                |                                                               |
| [x]  | `features/conversation/composer/context-meter.tsx`   | 62    | `feat(conversation): the composer's readings` | `ContextMeter`                                                |
| [x]  | `features/conversation/composer/model-menu.tsx`      | 126   | `feat(conversation): the composer menus`      | `ModelMenu`                                                   |
| [ ]  | `features/conversation/composer/palette.tsx`         | 115   | **missing**                                   | `Palette`, `PaletteEntry`                                     |
| [ ]  | `features/conversation/composer/permission-menu.tsx` | 94    | **missing**                                   | `PermissionMenu`                                              |
| [x]  | `features/conversation/composer/thinking-menu.tsx`   | 87    | `feat(conversation): the composer menus`      | `ThinkingMenu`                                                |
| [x]  | `features/conversation/composer/tools-menu.tsx`      | 86    | `feat(conversation): the composer menus`      | `ToolsMenu`                                                   |
| [x]  | `features/conversation/cost.ts`                      | 6     | `feat(conversation): the composer's readings` |                                                               |
| [ ]  | `features/conversation/dialogs.tsx`                  | 157   | **missing**                                   | `ConfirmDialog`, `QuestionDialog`                             |
| [ ]  | `features/conversation/export-file.ts`               | 25    | **missing**                                   | `downloadExport`                                              |
| [ ]  | `features/conversation/fork-dialog.tsx`              | 129   | **missing**                                   | `ForkSessionDialog`                                           |
| [ ]  | `features/conversation/new-chat.tsx`                 | 156   | exists, changed (163 lines)                   |                                                               |
| [ ]  | `features/conversation/pending-draft.ts`             | 18    | **missing**                                   | `clearPendingDraft`, `pendingDraftOf`, `setPendingDraft`      |
| [x]  | `features/conversation/run-status.tsx`               | 150   | `feat(conversation): the run status`          |                                                               |
| [ ]  | `features/conversation/session-context-sentence.ts`  | 38    | **missing**                                   | `contextSentence`                                             |
| [ ]  | `features/conversation/session-controls.tsx`         | 163   | exists, changed (353 lines)                   |                                                               |
| [ ]  | `features/conversation/session-header.tsx`           | 194   | **missing**                                   | `ComposerPlace`, `SessionHeader`                              |
| [ ]  | `features/conversation/session-loader.tsx`           | 22    | **missing**                                   | `SessionLoader`                                               |
| [ ]  | `features/conversation/session-view.tsx`             | 287   | **missing**                                   | `SessionView`                                                 |
| [ ]  | `features/conversation/store.ts`                     | 325   | **missing**                                   | `ConversationSnapshot`, `ConversationStore`                   |
| [ ]  | `features/conversation/tool-trace.tsx`               | 269   | **missing**                                   | `ToolTrace`                                                   |
| [ ]  | `features/conversation/transcript.tsx`               | 318   | exists, changed (633 lines)                   |                                                               |
| [ ]  | `features/conversation/tree-dialog.tsx`              | 386   | **missing**                                   | `SessionTreeDialog`, `TreeMove`                               |
| [ ]  | `features/conversation/tree-filter.ts`               | 33    | **missing**                                   | `filterTree`                                                  |
| [ ]  | `features/conversation/use-branching.tsx`            | 114   | **missing**                                   | `useBranching`                                                |
| [ ]  | `features/conversation/use-conversation.ts`          | 58    | exists, changed (403 lines)                   |                                                               |
| [ ]  | `features/conversation/welcome.tsx`                  | 29    | exists, changed (17 lines)                    |                                                               |
| [ ]  | `features/projects/continue-session.tsx`             | 61    | **missing**                                   | `ContinueSession`                                             |
| [ ]  | `features/projects/trust-gate.tsx`                   | 85    | **missing**                                   | `TrustGate`                                                   |

## S3 Sessions sidebar and projects

| Done | main file (`client/src/…`)              | Lines | Branch today                | Missing exports                         |
| ---- | --------------------------------------- | ----- | --------------------------- | --------------------------------------- |
| [ ]  | `features/projects/folder-dialog.tsx`   | 408   | exists, changed (69 lines)  |                                         |
| [ ]  | `features/projects/index.ts`            | 5     | exists, changed (6 lines)   |                                         |
| [ ]  | `features/projects/queries.ts`          | 38    | partial                     | `useProjectStatus`, `useRecentProjects` |
| [ ]  | `features/projects/trust-notice.tsx`    | 39    | exists, changed (6 lines)   |                                         |
| [ ]  | `features/sessions/format.ts`           | 26    | exists, changed (2 lines)   |                                         |
| [ ]  | `features/sessions/index.ts`            | 2     | exists, changed (7 lines)   |                                         |
| [ ]  | `features/sessions/rename-dialog.tsx`   | 88    | exists, changed (10 lines)  |                                         |
| [ ]  | `features/sessions/session-item.tsx`    | 146   | exists, changed (5 lines)   |                                         |
| [ ]  | `features/sessions/session-sidebar.tsx` | 588   | exists, changed (159 lines) |                                         |
| [ ]  | `features/sessions/sidebar-account.tsx` | 78    | exists, changed (4 lines)   |                                         |
| [ ]  | `features/sessions/use-session-row.ts`  | 28    | **missing**                 | `useSessionRow`                         |

## S4 Settings: MCP

| Done | main file (`client/src/…`)                       | Lines | Branch today | Missing exports                                                                                                                           |
| ---- | ------------------------------------------------ | ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `features/settings/mcp/mcp-add-dialog.tsx`       | 244   | **missing**  | `McpAddDialog`                                                                                                                            |
| [ ]  | `features/settings/mcp/mcp-add-source.tsx`       | 243   | **missing**  | `McpAddSource`, `NameField`                                                                                                               |
| [ ]  | `features/settings/mcp/mcp-add-values.tsx`       | 153   | **missing**  | `McpAddClash`, `McpAddScope`, `McpAddValues`, `TypedValues`                                                                               |
| [ ]  | `features/settings/mcp/mcp-advanced.tsx`         | 81    | **missing**  | `McpAdvanced`                                                                                                                             |
| [ ]  | `features/settings/mcp/mcp-connection.tsx`       | 143   | **missing**  | `McpConnection`                                                                                                                           |
| [ ]  | `features/settings/mcp/mcp-detail.ts`            | 25    | **missing**  | `asScope`, `isOverrideSubject`, `McpOverrideSubject`, `McpServerEntryDetail`                                                              |
| [ ]  | `features/settings/mcp/mcp-draft.ts`             | 161   | **missing**  | `draftOf`, `ExposureRow`, `inputOf`, `McpDraft`                                                                                           |
| [ ]  | `features/settings/mcp/mcp-exposure-rows.tsx`    | 83    | **missing**  | `McpToolExposureRows`                                                                                                                     |
| [ ]  | `features/settings/mcp/mcp-exposure-select.tsx`  | 51    | **missing**  | `ExposureSelect`                                                                                                                          |
| [ ]  | `features/settings/mcp/mcp-exposure.ts`          | 16    | **missing**  | `exposureItems`, `exposureLabel`                                                                                                          |
| [ ]  | `features/settings/mcp/mcp-form.tsx`             | 308   | **missing**  | `McpEditor`                                                                                                                               |
| [ ]  | `features/settings/mcp/mcp-import.ts`            | 161   | **missing**  | `AddMode`, `Candidate`, `candidatesOf`, `emptySource`, `inputOfCandidate`, `nameProblemOf`, `PasteState`, `previewOfPaste`, `SourceDraft` |
| [ ]  | `features/settings/mcp/mcp-oauth.tsx`            | 174   | **missing**  | `McpOAuthFields`                                                                                                                          |
| [ ]  | `features/settings/mcp/mcp-override.tsx`         | 116   | **missing**  | `McpOverrideForm`                                                                                                                         |
| [ ]  | `features/settings/mcp/mcp-panel.tsx`            | 291   | **missing**  | `McpLayout`                                                                                                                               |
| [ ]  | `features/settings/mcp/mcp-raw-draft.ts`         | 74    | **missing**  | `McpRawDraft`, `useMcpRawDraft`                                                                                                           |
| [ ]  | `features/settings/mcp/mcp-raw.tsx`              | 22    | **missing**  | `McpRawPane`                                                                                                                              |
| [ ]  | `features/settings/mcp/mcp-registry-browser.tsx` | 343   | **missing**  | `McpRegistryBrowser`                                                                                                                      |
| [ ]  | `features/settings/mcp/mcp-registry-queries.ts`  | 38    | **missing**  | `useRegistrySearch`, `useRegistryServer`                                                                                                  |
| [ ]  | `features/settings/mcp/mcp-registry-values.tsx`  | 127   | **missing**  | `McpRegistryValues`                                                                                                                       |
| [ ]  | `features/settings/mcp/mcp-registry.ts`          | 114   | **missing**  | `chosenOption`, `defaultNameOf`, `emptyRegistry`, `missingInputs`, `RegistryDraft`, `serverOf`, `valueOf`                                 |
| [ ]  | `features/settings/mcp/mcp-server-card.tsx`      | 37    | **missing**  | `McpServerCard`                                                                                                                           |
| [ ]  | `features/settings/mcp/mcp-signin.tsx`           | 113   | **missing**  | `McpSignIn`                                                                                                                               |
| [ ]  | `features/settings/mcp/mcp-state.ts`             | 57    | **missing**  | `mcpServerState`, `McpServerState`                                                                                                        |
| [ ]  | `features/settings/mcp/mcp-tools.tsx`            | 176   | **missing**  | `McpTools`                                                                                                                                |
| [ ]  | `features/settings/mcp/mcp-validation.ts`        | 164   | **missing**  | `McpField`, `mcpFieldErrors`, `McpFieldErrors`, `mcpFields`                                                                               |

## S5 Settings: Providers

| Done | main file (`client/src/…`)                                  | Lines | Branch today                | Missing exports                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------- | ----- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `features/settings/providers/add-provider-dialog.tsx`       | 135   | **missing**                 | `AddMode`, `AddProviderDialog`                                                                                                                                                                        |
| [ ]  | `features/settings/providers/provider-api-select.tsx`       | 71    | **missing**                 | `ProviderApiSelect`                                                                                                                                                                                   |
| [ ]  | `features/settings/providers/provider-connection.tsx`       | 221   | **missing**                 | `ProviderConnection`                                                                                                                                                                                  |
| [ ]  | `features/settings/providers/provider-draft.ts`             | 153   | **missing**                 | `draftOf`, `inputOf`, `providerApiUnset`, `ProviderDraft`, `providerIdFromName`, `providerNamesInUse`, `testInputOf`, `uniqueProviderId`                                                              |
| [ ]  | `features/settings/providers/provider-editor.tsx`           | 266   | exists, changed (630 lines) |                                                                                                                                                                                                       |
| [ ]  | `features/settings/providers/provider-footer.tsx`           | 33    | **missing**                 | `ProviderActions`                                                                                                                                                                                     |
| [ ]  | `features/settings/providers/provider-import-dialog.tsx`    | 136   | **missing**                 | `ProviderImportDialog`                                                                                                                                                                                |
| [ ]  | `features/settings/providers/provider-model-advanced.tsx`   | 204   | **missing**                 | `ModelAdvancedFields`                                                                                                                                                                                 |
| [ ]  | `features/settings/providers/provider-model-cost.tsx`       | 112   | **missing**                 | `ModelCostFields`                                                                                                                                                                                     |
| [ ]  | `features/settings/providers/provider-model-dialog.tsx`     | 247   | **missing**                 | `ProviderModelDialog`                                                                                                                                                                                 |
| [ ]  | `features/settings/providers/provider-model-form.ts`        | 422   | **missing**                 | `completeModelOf`, `costTiersSchema`, `formOf`, `jsonOf`, `ModelField`, `ModelForm`, `ModelMode`, `ModelValue`, `overrideOf`, `samplingByLevelSchema`, `samplingParamsSchema`, `touchedBy`, `valueOf` |
| [ ]  | `features/settings/providers/provider-models.tsx`           | 346   | **missing**                 | `ProviderModels`                                                                                                                                                                                      |
| [ ]  | `features/settings/providers/provider-reasoning-fields.tsx` | 276   | **missing**                 | `ModelReasoningFields`, `ReasoningCompatFields`                                                                                                                                                       |
| [ ]  | `features/settings/providers/provider-sign-in.tsx`          | 487   | exists, changed (599 lines) |                                                                                                                                                                                                       |
| [ ]  | `features/settings/providers/provider-test-menu.tsx`        | 84    | **missing**                 | `ProviderTestMenu`                                                                                                                                                                                    |
| [ ]  | `features/settings/providers/provider-validation.ts`        | 274   | **missing**                 | `advancedFields`, `ModelField`, `modelFieldErrors`, `ModelFieldErrors`, `modelFields`, `ProviderField`, `providerFieldErrors`, `ProviderFieldErrors`, `providerFields`, `ProviderValidation`          |
| [ ]  | `features/settings/providers/providers-panel.tsx`           | 125   | exists, changed (140 lines) |                                                                                                                                                                                                       |
| [ ]  | `features/settings/providers/reasoning.ts`                  | 123   | **missing**                 | `compatForApi`, `defaultsFor`, `LevelRow`, `ReasoningForm`, `reasoningFormOf`, `reasoningOf`, `THINKING_LEVEL_LABELS`, `THINKING_LEVELS`                                                              |
| [ ]  | `features/settings/providers/test-level-select.tsx`         | 57    | **missing**                 | `TestLevelSelect`                                                                                                                                                                                     |

## S6 Settings: Skills

| Done | main file (`client/src/…`)                               | Lines | Branch today                | Missing exports                                                                 |
| ---- | -------------------------------------------------------- | ----- | --------------------------- | ------------------------------------------------------------------------------- |
| [ ]  | `features/settings/skills/foreign-skills.tsx`            | 103   | **missing**                 | `ForeignSkills`                                                                 |
| [ ]  | `features/settings/skills/import/candidate-card.tsx`     | 129   | **missing**                 | `CandidateCard`                                                                 |
| [ ]  | `features/settings/skills/import/import-dialog.tsx`      | 88    | exists, changed (387 lines) |                                                                                 |
| [ ]  | `features/settings/skills/import/read-folder.ts`         | 125   | partial                     | `archiveProblem`, `checkFolder`, `filesOfDrop`, `filesOfInput`, `PickedFolder`  |
| [ ]  | `features/settings/skills/import/review-step.tsx`        | 197   | **missing**                 | `ReviewStep`                                                                    |
| [ ]  | `features/settings/skills/import/source-step.tsx`        | 222   | **missing**                 | `SourceStep`                                                                    |
| [ ]  | `features/settings/skills/import/use-skill-import.ts`    | 101   | partial                     | `Staged`                                                                        |
| [ ]  | `features/settings/skills/skill-body-checks.ts`          | 48    | **missing**                 | `bodyDiagnostics`                                                               |
| [ ]  | `features/settings/skills/skill-body-field.tsx`          | 261   | **missing**                 | `BodyReferences`, `SkillBodyField`                                              |
| [ ]  | `features/settings/skills/skill-card.tsx`                | 74    | **missing**                 | `SkillCard`                                                                     |
| [ ]  | `features/settings/skills/skill-delete-entry-dialog.tsx` | 68    | **missing**                 | `SkillDeleteEntryDialog`                                                        |
| [ ]  | `features/settings/skills/skill-draft.ts`                | 61    | partial                     | `SkillErrors`, `skillFields`                                                    |
| [ ]  | `features/settings/skills/skill-editor.tsx`              | 52    | exists, changed (54 lines)  |                                                                                 |
| [ ]  | `features/settings/skills/skill-file-dialog.tsx`         | 131   | **missing**                 | `SkillFileDialog`                                                               |
| [ ]  | `features/settings/skills/skill-file-tree.ts`            | 47    | **missing**                 | `BundleEntry`, `formatSize`, `languageOf`, `newFileProblem`, `newFolderProblem` |
| [ ]  | `features/settings/skills/skill-files-list.tsx`          | 47    | **missing**                 | `SkillFilesList`                                                                |
| [ ]  | `features/settings/skills/skill-files.tsx`               | 138   | **missing**                 | `SkillFiles`                                                                    |
| [ ]  | `features/settings/skills/skill-form.tsx`                | 289   | partial                     | `SkillPageState`                                                                |
| [ ]  | `features/settings/skills/skill-groups.ts`               | 87    | exists, changed (22 lines)  |                                                                                 |
| [ ]  | `features/settings/skills/skill-instructions.tsx`        | 30    | **missing**                 | `SkillInstructions`                                                             |
| [ ]  | `features/settings/skills/skill-loaded-switch.tsx`       | 27    | **missing**                 | `LoadedSwitch`                                                                  |
| [ ]  | `features/settings/skills/skill-modes.ts`                | 14    | exists, changed (6 lines)   |                                                                                 |
| [ ]  | `features/settings/skills/skill-new-entry-dialog.tsx`    | 164   | **missing**                 | `NewEntryKind`, `SkillNewEntryDialog`                                           |
| [ ]  | `features/settings/skills/skill-notices.tsx`             | 49    | **missing**                 | `SkillNotices`                                                                  |
| [ ]  | `features/settings/skills/skill-page-state.ts`           | 36    | **missing**                 | `useSkillPage`                                                                  |
| [ ]  | `features/settings/skills/skill-page.tsx`                | 51    | exists, changed (19 lines)  |                                                                                 |
| [ ]  | `features/settings/skills/skill-path-dialog.tsx`         | 85    | **missing**                 | `SkillPathDialog`                                                               |
| [ ]  | `features/settings/skills/skill-paths.tsx`               | 66    | **missing**                 | `SkillPaths`                                                                    |
| [ ]  | `features/settings/skills/skill-raw-pane.tsx`            | 84    | **missing**                 | `RawPane`                                                                       |
| [ ]  | `features/settings/skills/skill-raw-source.ts`           | 80    | **missing**                 | `RawSource`, `useRawFile`, `useRawFiles`, `useRawSave`                          |
| [ ]  | `features/settings/skills/skill-raw.tsx`                 | 282   | exists, changed (310 lines) |                                                                                 |
| [ ]  | `features/settings/skills/skill-references.ts`           | 43    | **missing**                 | `useSkillLinks`                                                                 |
| [ ]  | `features/settings/skills/skill-search.ts`               | 25    | partial                     | `skillSearchSchema`                                                             |
| [x]  | `features/settings/skills/skill-starter.ts`              | 14    | identical                   |                                                                                 |
| [ ]  | `features/settings/skills/skill-status.ts`               | 41    | **missing**                 | `isOn`, `readOnlyReason`, `useSkillToggle`                                      |
| [ ]  | `features/settings/skills/skill-unreadable.tsx`          | 18    | **missing**                 | `SkillUnreadable`                                                               |
| [ ]  | `features/settings/skills/skill-viewer.tsx`              | 110   | exists, changed (158 lines) |                                                                                 |
| [ ]  | `features/settings/skills/skills-panel.tsx`              | 154   | exists, changed (97 lines)  |                                                                                 |

## S7 Settings: Context

| Done | main file (`client/src/…`)                      | Lines | Branch today | Missing exports                                                                                                                  |
| ---- | ----------------------------------------------- | ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `features/settings/context/context-detail.tsx`  | 88    | **missing**  | `ContextSectionPage`                                                                                                             |
| [ ]  | `features/settings/context/context-pages.tsx`   | 284   | **missing**  | `ContextExtensions`, `ContextFiles`, `ContextPackages`, `ContextPrompts`, `ContextSkills`, `ContextSystemPrompt`, `ContextTools` |
| [ ]  | `features/settings/context/context-panel.tsx`   | 87    | **missing**  | `ContextLayout`                                                                                                                  |
| [ ]  | `features/settings/context/context-sections.ts` | 123   | **missing**  | `CONTEXT_SECTIONS`, `contextSection`, `ContextSection`, `ContextSectionId`, `counted`                                            |

## S8 Settings: General, Packages, shell

| Done | main file (`client/src/…`)                              | Lines | Branch today                | Missing exports                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------- | ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `features/settings/general/general.tsx`                 | 120   | exists, changed (230 lines) |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/general/model-picker.tsx`            | 107   | exists, changed (9 lines)   |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/general/setting-controls.tsx`        | 608   | exists, changed (128 lines) |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/general/settings-catalog.ts`         | 412   | exists, changed (22 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/general/settings-form.tsx`           | 239   | exists, changed (98 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/index.ts`                            | 2     | exists, changed (5 lines)   |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/package-detail.tsx`         | 152   | exists, changed (20 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/package-install-dialog.tsx` | 89    | exists, changed (11 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/package-kind.ts`            | 44    | exists, changed (2 lines)   |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/package-provides.tsx`       | 85    | exists, changed (11 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/package-resource.ts`        | 21    | exists, changed (7 lines)   |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/packages/packages-panel.tsx`         | 111   | exists, changed (19 lines)  |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/queries.ts`                          | 219   | partial                     | `contextQuery`, `listedSkillQuery`, `mcpQuery`, `packageResourcesQuery`, `providerQuery`, `skillQuery`, `useListedSkill`, `useMcpRaw`, `useMcpServer`, `useProviderDetail`, `useProviderLogin`, `useSkillBundleFile`, `useSkillFiles` |
| [ ]  | `features/settings/shell/sections.ts`                   | 50    | exists, changed (8 lines)   |                                                                                                                                                                                                                                       |
| [ ]  | `features/settings/shell/settings-shell.tsx`            | 138   | exists, changed (9 lines)   |                                                                                                                                                                                                                                       |

## S9 Shared components, editor, styles, lib

| Done | main file (`client/src/…`)                            | Lines | Branch today                   | Missing exports |
| ---- | ----------------------------------------------------- | ----- | ------------------------------ | --------------- |
| [ ]  | `app/app-shell.tsx`                                   | 37    | exists elsewhere (names found) |                 |
| [ ]  | `app/query-client.ts`                                 | 23    | exists elsewhere (names found) |                 |
| [ ]  | `app/router-context.ts`                               | 4     | exists elsewhere (names found) |                 |
| [ ]  | `app/router.tsx`                                      | 38    | exists elsewhere (names found) |                 |
| [x]  | `components/editor/code-editor/checks.ts`             | 66    | identical                      |                 |
| [ ]  | `components/editor/code-editor/code-editor.tsx`       | 313   | exists, changed (5 lines)      |                 |
| [x]  | `components/editor/code-editor/format.ts`             | 53    | identical                      |                 |
| [ ]  | `components/editor/code-editor/markdown-commands.ts`  | 164   | exists, changed (2 lines)      |                 |
| [x]  | `components/editor/code-editor/theme.ts`              | 120   | identical                      |                 |
| [ ]  | `components/editor/file-tree.tsx`                     | 251   | exists, changed (19 lines)     |                 |
| [ ]  | `components/editor/highlight.tsx`                     | 185   | exists, changed (94 lines)     |                 |
| [ ]  | `components/editor/markdown.tsx`                      | 65    | exists, changed (102 lines)    |                 |
| [x]  | `components/patterns/controls/enabled-switch.tsx`     | 30    | identical                      |                 |
| [ ]  | `components/patterns/dialog/dialog-frame.tsx`         | 70    | exists, changed (2 lines)      |                 |
| [x]  | `components/patterns/form/use-draft-form.ts`          | 72    | identical                      |                 |
| [ ]  | `components/patterns/list/list-group.tsx`             | 18    | exists, changed (8 lines)      |                 |
| [ ]  | `components/patterns/list/list-item.tsx`              | 70    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/list/list-pane.tsx`              | 116   | exists, changed (22 lines)     |                 |
| [x]  | `components/patterns/list/search-field.tsx`           | 30    | identical                      |                 |
| [ ]  | `components/patterns/pane/detail-page.tsx`            | 86    | exists, changed (11 lines)     |                 |
| [ ]  | `components/patterns/pane/detail-placeholder.tsx`     | 16    | exists, changed (1 lines)      |                 |
| [x]  | `components/patterns/pane/gutter.ts`                  | 8     | identical                      |                 |
| [ ]  | `components/patterns/pane/master-detail.tsx`          | 31    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/pane/pane-band.tsx`              | 26    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/pane/pane-bar.tsx`               | 63    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/pane/pane-body.tsx`              | 33    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/pane/pane-footer.tsx`            | 46    | exists, changed (1 lines)      |                 |
| [ ]  | `components/patterns/pane/pane.tsx`                   | 22    | exists, changed (1 lines)      |                 |
| [x]  | `components/patterns/section/animated-row.tsx`        | 14    | identical                      |                 |
| [ ]  | `components/patterns/section/collapsible-section.tsx` | 89    | exists, changed (2 lines)      |                 |
| [x]  | `components/patterns/section/field-stack.tsx`         | 8     | identical                      |                 |
| [ ]  | `components/patterns/section/pair-rows.tsx`           | 134   | exists, changed (9 lines)      |                 |
| [ ]  | `components/patterns/section/row.tsx`                 | 46    | exists, changed (3 lines)      |                 |
| [ ]  | `components/patterns/section/section.tsx`             | 25    | exists, changed (2 lines)      |                 |
| [x]  | `components/patterns/section/use-animated-rows.ts`    | 37    | identical                      |                 |
| [x]  | `components/patterns/shortcut.ts`                     | 5     | identical                      |                 |
| [x]  | `components/patterns/tabs/mode-tabs.tsx`              | 40    | identical                      |                 |
| [ ]  | `components/patterns/tabs/scope-tabs.tsx`             | 135   | exists, changed (8 lines)      |                 |
| [x]  | `components/patterns/tip.tsx`                         | 28    | identical                      |                 |
| [ ]  | `components/ui/badge.tsx`                             | 51    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/bubble.tsx`                            | 123   | exists, changed (3 lines)      |                 |
| [ ]  | `components/ui/button.tsx`                            | 57    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/checkbox.tsx`                          | 26    | exists, changed (5 lines)      |                 |
| [ ]  | `components/ui/code-block.tsx`                        | 235   | exists, changed (6 lines)      |                 |
| [x]  | `components/ui/collapsible.tsx`                       | 15    | identical                      |                 |
| [ ]  | `components/ui/command.tsx`                           | 179   | exists, changed (6 lines)      |                 |
| [ ]  | `components/ui/context-menu.tsx`                      | 241   | exists, changed (7 lines)      |                 |
| [ ]  | `components/ui/dialog.tsx`                            | 133   | exists, changed (10 lines)     |                 |
| [ ]  | `components/ui/dropdown-menu.tsx`                     | 252   | exists, changed (9 lines)      |                 |
| [ ]  | `components/ui/field.tsx`                             | 224   | exists, changed (4 lines)      |                 |
| [ ]  | `components/ui/input-group.tsx`                       | 146   | exists, changed (4 lines)      |                 |
| [ ]  | `components/ui/input.tsx`                             | 19    | exists, changed (5 lines)      |                 |
| [ ]  | `components/ui/item.tsx`                              | 188   | exists, changed (4 lines)      |                 |
| [ ]  | `components/ui/label.tsx`                             | 19    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/marker.tsx`                            | 67    | exists, changed (3 lines)      |                 |
| [ ]  | `components/ui/message-scroller.tsx`                  | 130   | exists, changed (6 lines)      |                 |
| [ ]  | `components/ui/message.tsx`                           | 84    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/popover.tsx`                           | 79    | exists, changed (5 lines)      |                 |
| [ ]  | `components/ui/radio-group.tsx`                       | 37    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/select.tsx`                            | 187   | exists, changed (9 lines)      |                 |
| [ ]  | `components/ui/separator.tsx`                         | 18    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/sheet.tsx`                             | 125   | exists, changed (6 lines)      |                 |
| [ ]  | `components/ui/sidebar.tsx`                           | 386   | exists, changed (8 lines)      |                 |
| [ ]  | `components/ui/spinner.tsx`                           | 16    | exists, changed (3 lines)      |                 |
| [ ]  | `components/ui/switch.tsx`                            | 29    | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/tabs.tsx`                              | 103   | exists, changed (1 lines)      |                 |
| [ ]  | `components/ui/textarea.tsx`                          | 17    | exists, changed (3 lines)      |                 |
| [ ]  | `components/ui/tooltip.tsx`                           | 53    | exists, changed (3 lines)      |                 |
| [ ]  | `components/ui/trace.tsx`                             | 149   | exists, changed (4 lines)      |                 |
| [ ]  | `features/readiness/not-ready.tsx`                    | 28    | exists elsewhere (names found) |                 |
| [ ]  | `features/readiness/use-readiness.ts`                 | 20    | exists elsewhere (names found) |                 |
| [x]  | `hooks/use-dialog-motion.ts`                          | 42    | identical                      |                 |
| [x]  | `hooks/use-last-defined.ts`                           | 15    | identical                      |                 |
| [x]  | `hooks/use-mobile.ts`                                 | 21    | identical                      |                 |
| [x]  | `index.css`                                           | 177   | identical                      |                 |
| [ ]  | `lib/cn.ts`                                           | 21    | exists, changed (3 lines)      |                 |
| [x]  | `lib/utils.ts`                                        | 6     | identical                      |                 |
| [ ]  | `main.tsx`                                            | 23    | exists, changed (35 lines)     |                 |
| [ ]  | `socket/link.ts`                                      | 165   | exists elsewhere (names found) |                 |
| [x]  | `styles/motion.css`                                   | 84    | identical                      |                 |
| [x]  | `styles/tokens.css`                                   | 131   | identical                      |                 |
| [x]  | `typeset.css`                                         | 453   | identical                      |                 |
