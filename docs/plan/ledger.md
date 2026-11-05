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

| Done | main                                                                              | For slice | Branch today                                                                           |
| ---- | --------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| [x]  | chat `bash`, `abort_bash`                                                         | S2        | `feat(conversation): the run status`                                                   |
| [x]  | chat `autocomplete`                                                               | S2        | `feat(conversation): the palette's data`                                               |
| [x]  | chat `cancel_retry`, `set_auto_retry`                                             | S2        | `feat(conversation): the run controls`                                                 |
| [x]  | chat `set_auto_compaction`, `abort_compaction`                                    | S2        | `feat(conversation): the run controls`                                                 |
| [x]  | chat `clear_queue`                                                                | S2        | `feat(conversation): the run controls`                                                 |
| [x]  | chat `set_label`                                                                  | S2        | `feat(conversation): the run controls`                                                 |
| [x]  | chat `set_hide_thinking`                                                          | S2        | `feat(conversation): the run controls`                                                 |
| [x]  | chat `set_tree_filter_mode`                                                       | S2        | `feat(conversation): the branch rows` (`setTreeFilterMode`)                            |
| [x]  | chat `reload`, `reload_session`                                                   | S2        | verified: `/reload` is pi's, `reloadFromDisk` is `reload_session`                      |
| [x]  | chat `set_coding_tools`                                                           | S2        | `feat(conversation): the composer menus`                                               |
| [x]  | `POST /api/sessions/{id}/export`                                                  | S2        | `feat(conversation): the transcript as a file` (`conversation.query` kind `export`)    |
| [x]  | `POST /api/sessions/{id}/clone`                                                   | S2        | `feat(conversation): the branch rows` (`clone`, pi's fork at the leaf)                 |
| [x]  | `POST /api/sessions/{id}/move`                                                    | S3        | `feat(conversation): the move` (`sessions.move`, pi's `forkFrom`)                      |
| [x]  | `DELETE /api/projects/sessions` (delete a project's chats)                        | S3        | `feat(sessions): a project's chats are deleted together` (`sessions.removeProject`)    |
| [ ]  | a deleted chat's pin, and an emptied session folder, are left behind              | S3        | `sessions.remove` forgets no pin; no route drops the folder main's `removeProject` did |
| [x]  | `PUT /api/settings/mcp/default-tool`                                              | S4        | `feat(settings): the MCP default tool` (`settings.mcp.setDefaultTool`)                 |
| [x]  | `POST /api/settings/mcp/command`                                                  | S4        | `feat(settings): the MCP sign-in line` (`settings.mcp.command`)                        |
| [x]  | `POST /api/settings/providers/models` (read a provider's model list)              | S5        | `feat(settings): the model import` (`settings.providers.import`)                       |
| [x]  | `POST /api/settings/providers/test`                                               | S5        | `feat(settings): the provider test` (`settings.providers.test`)                        |
| [x]  | `POST /api/settings/providers/{id}/logout` (through `ModelRuntime.logout()`)      | S5        | `feat(settings): the provider account` (`settings.providers.logout`)                   |
| [x]  | `POST /api/settings/skills/folders/link`, `…/unlink`                              | S6        | `feat(skills): the folders other agents keep` (`settings.skills.setFolderLinked`)      |
| [x]  | a skill's bundled files: list, read, write, delete file, create and delete folder | S6        | `feat(skills): a skill's bundled files on the server` (`settings.skills.*File(s)`)     |
| [x]  | `GET /api/settings/skills/listed-files`, `GET …/listed-file` (read-only skills)   | S6        | `feat(skills): a listed skill's files` (`listDocumentFiles`, `readDocumentFile`)       |
| [x]  | `PUT /api/settings/skills/paths`, `DELETE …/paths` (any folder or `.md` file)     | S6        | `feat(skills): the skill paths` (`settings.skills.addPath`, `removePath`)              |
| [x]  | `listProviders` also lists a `models.json` entry pi cannot compose                | S5        | `feat(settings): the entry pi cannot compose`                                          |

## Client files

## S1 Feedback system (status line, route error, not found, notices, confirms)

These rows are the feedback system itself, so their differences from main are the change
phase 2 was for: one `Tone` (`StatusTone`/`NoticeTone` are gone), `Notice` and `StatusView`
take `error` through `errorView`, `errorView` switches exhaustively over the protocol's
tags, and `LoadingState`'s spinner is decorative because the status line is the page's one
live region. `use-app-health` became `src/app/core/status.tsx`: `useAppHealth` reads the
socket and the out-of-date flag, and `AppStatus` replaces the banner. The confirm
dialogs, `InlineStatus`, `Notice` and the alert primitives carry main's words and classes;
`alert`/`alert-dialog` differ only in class order.

| Done | main file (`client/src/…`)                       | Lines | Branch today                                                                       | Missing exports         |
| ---- | ------------------------------------------------ | ----- | ---------------------------------------------------------------------------------- | ----------------------- |
| [x]  | `app/route-error.tsx`                            | 26    | on `StatusView`, per layout                                                        |                         |
| [x]  | `app/route-not-found.tsx`                        | 25    | on `StatusView`, per layout                                                        |                         |
| [x]  | `app/route-pending.tsx`                          | 10    | per layout (`LoadingState`)                                                        |                         |
| [x]  | `components/patterns/dialog/confirm-dialogs.tsx` | 210   | `fix(settings): the pending confirm spins`                                         |                         |
| [x]  | `components/patterns/status/app-banner.tsx`      | 38    | deleted                                                                            | replaced by `AppStatus` |
| [x]  | `components/patterns/status/error-view.ts`       | 59    | `refactor(feedback): every feature reports through the surfaces`                   |                         |
| [x]  | `components/patterns/status/inline-status.tsx`   | 23    | `refactor(feedback): one tone vocabulary for every surface`                        |                         |
| [x]  | `components/patterns/status/loading-state.tsx`   | 11    | `feat(client): the chat's drift rule, long chats, providers and diagnostics fixes` |                         |
| [x]  | `components/patterns/status/notice.tsx`          | 45    | `refactor(feedback): every feature reports through the surfaces`                   |                         |
| [x]  | `components/patterns/status/status-tone.ts`      | 15    | `refactor(feedback): one tone vocabulary for every surface`                        |                         |
| [x]  | `components/patterns/status/status-view.tsx`     | 34    | `refactor(feedback): every feature reports through the surfaces`                   |                         |
| [x]  | `components/ui/alert-dialog.tsx`                 | 160   | `feat(client): the socket runtime, the shell and the chat`                         |                         |
| [x]  | `components/ui/alert.tsx`                        | 77    | `feat(client): the socket runtime, the shell and the chat`                         |                         |
| [x]  | `features/app-shell/app-health-banner.tsx`       | 32    | **missing**                                                                        | replaced by `AppStatus` |
| [x]  | `features/app-shell/use-app-health.ts`           | 39    | `refactor(feedback): one tone vocabulary for every surface`                        |                         |

## S2 Chat (session view, composer, transcript, branches, dialogs)

| Done | main file (`client/src/…`)                           | Lines | Branch today                                                                                             | Missing exports                                                    |
| ---- | ---------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [x]  | `features/conversation/branch-items.tsx`             | 71    | `feat(conversation): the branch rows`                                                                    | `BranchItems`                                                      |
| [x]  | `features/conversation/branch-rules.ts`              | 7     | `feat(conversation): the branch rows`                                                                    | `branchBlocked`                                                    |
| [x]  | `features/conversation/chat-bar.tsx`                 | 31    | `feat(conversation): main's chat bar`                                                                    |                                                                    |
| [x]  | `features/conversation/compact-context-dialog.tsx`   | 78    | `feat(conversation): the fork and compact dialogs`                                                       | `CompactContextDialog`                                             |
| [x]  | `features/conversation/composer/attachments.tsx`     | 49    | `feat(conversation): the composer's images`                                                              | `Attachment`, `AttachmentStrip`                                    |
| [x]  | `features/conversation/composer/builtin-commands.ts` | 227   | `feat(conversation): the palette and its commands`                                                       | `ComposerCommandContext`, `RouteTarget`, `runComposerCommand`      |
| [x]  | `features/conversation/composer/cache-warming.tsx`   | 50    | `feat(conversation): the composer's readings`                                                            | `CacheWarmingState`                                                |
| [x]  | `features/conversation/composer/composer.tsx`        | 669   | `feat(conversation): the extension's widget`                                                             |                                                                    |
| [x]  | `features/conversation/composer/context-meter.tsx`   | 62    | `feat(conversation): the composer's readings`                                                            | `ContextMeter`                                                     |
| [x]  | `features/conversation/composer/model-menu.tsx`      | 126   | `feat(conversation): the composer menus`                                                                 | `ModelMenu`                                                        |
| [x]  | `features/conversation/composer/palette.tsx`         | 115   | `feat(conversation): the palette and its commands`                                                       | `Palette`, `PaletteEntry`                                          |
| [x]  | `features/conversation/composer/permission-menu.tsx` | 94    | `feat(conversation): the permission menu and the status rail`                                            | `PermissionMenu`                                                   |
| [x]  | `features/conversation/composer/thinking-menu.tsx`   | 87    | `feat(conversation): the composer menus`                                                                 | `ThinkingMenu`                                                     |
| [x]  | `features/conversation/composer/tools-menu.tsx`      | 86    | `feat(conversation): the composer menus`                                                                 | `ToolsMenu`                                                        |
| [x]  | `features/conversation/cost.ts`                      | 6     | `feat(conversation): the composer's readings`                                                            |                                                                    |
| [x]  | `features/conversation/dialogs.tsx`                  | 157   | `fix(engine): a question asked at session start reaches the page` (photographed open and answered)       | `ConfirmDialog`, `QuestionDialog`                                  |
| [x]  | `features/conversation/export-file.ts`               | 25    | `feat(conversation): the transcript as a file`                                                           | `downloadExport`                                                   |
| [x]  | `features/conversation/fork-dialog.tsx`              | 129   | `feat(conversation): the fork and compact dialogs`                                                       | `ForkSessionDialog`                                                |
| [x]  | `features/conversation/new-chat.tsx`                 | 156   | `feat(conversation): the new chat's project picker`                                                      |                                                                    |
| [x]  | `features/conversation/pending-draft.ts`             | 18    | `draft.ts` (the engine hands the text across; no store draft)                                            | `—`                                                                |
| [x]  | `features/conversation/run-status.tsx`               | 150   | `feat(conversation): the run status`                                                                     |                                                                    |
| [x]  | `features/conversation/session-context-sentence.ts`  | 38    | `feat(conversation): the palette and its commands`                                                       | `contextSentence`                                                  |
| [x]  | `features/conversation/session-controls.tsx`         | 163   | `feat(conversation): the branch rows` (the bar hosts it until S3)                                        |                                                                    |
| [x]  | `features/conversation/session-header.tsx`           | 194   | `feat(conversation): the new chat's project picker`                                                      | `SessionHeader`                                                    |
| [x]  | `features/conversation/session-loader.tsx`           | 22    | `feat(conversation): where the chat runs` (in `session-header.tsx`)                                      | `SessionLoader`                                                    |
| [x]  | `features/conversation/session-view.tsx`             | 287   | `feat(conversation): the session view`                                                                   | `SessionView` (the dialogs split waits for main's editor question) |
| [x]  | `features/conversation/store.ts`                     | 325   | `docs(plan): tick the chat's welcome and store` (replaced by `use-conversation.ts` + the domain reducer) | `ConversationSnapshot`, `ConversationStore`                        |
| [x]  | `features/conversation/tool-trace.tsx`               | 269   | `feat(conversation): each tool's own trace`                                                              | `ToolTrace`                                                        |
| [x]  | `features/conversation/transcript.tsx`               | 318   | `feat(conversation): the compaction summary row`                                                         |                                                                    |
| [x]  | `features/conversation/tree-dialog.tsx`              | 386   | `feat(conversation): the branch rows`                                                                    | `SessionTreeDialog`, `TreeMove`                                    |
| [x]  | `features/conversation/tree-filter.ts`               | 33    | `feat(conversation): the branch rows` (with main's test)                                                 | `filterTree`                                                       |
| [x]  | `features/conversation/use-branching.tsx`            | 114   | `feat(conversation): the branch rows` (the engine hands the text)                                        | `useBranching`                                                     |
| [x]  | `features/conversation/use-conversation.ts`          | 58    | `docs(plan): tick the chat's welcome and store` (exists, changed (403 lines))                            |                                                                    |
| [x]  | `features/conversation/welcome.tsx`                  | 29    | `docs(plan): tick the chat's welcome and store` (exists, changed (17 lines))                             |                                                                    |
| [x]  | `features/projects/continue-session.tsx`             | 61    | `feat(conversation): the session view` (recent from the caller)                                          | `ContinueSession`, `ContinuedSession`                              |
| [x]  | `features/projects/trust-gate.tsx`                   | 85    | `feat(conversation): the session view`                                                                   | `TrustGate`                                                        |

## S3 Sessions sidebar and projects

| Done | main file (`client/src/…`)              | Lines | Branch today                                                                            | Missing exports    |
| ---- | --------------------------------------- | ----- | --------------------------------------------------------------------------------------- | ------------------ |
| [x]  | `features/projects/folder-dialog.tsx`   | 408   | `refactor(sessions): settle the sidebar rows`; parity green                             |                    |
| [x]  | `features/projects/index.ts`            | 5     | `refactor(sessions): settle the sidebar rows`                                           |                    |
| [x]  | `features/projects/queries.ts`          | 38    | `refactor(sessions): settle the sidebar rows` (recent list lives in `sessions/list.ts`) | `useProjectStatus` |
| [x]  | `features/projects/trust-notice.tsx`    | 39    | `refactor(sessions): settle the sidebar rows` (main's copy)                             |                    |
| [x]  | `features/sessions/format.ts`           | 26    | verified: parity green                                                                  |                    |
| [x]  | `features/sessions/index.ts`            | 2     | `refactor(sessions): settle the sidebar rows`                                           |                    |
| [x]  | `features/sessions/rename-dialog.tsx`   | 88    | verified: parity green                                                                  |                    |
| [x]  | `features/sessions/session-item.tsx`    | 146   | verified: parity green (row menu photographed)                                          |                    |
| [x]  | `features/sessions/session-sidebar.tsx` | 588   | verified: parity green (sidebar photographed)                                           |                    |
| [x]  | `features/sessions/sidebar-account.tsx` | 78    | verified: parity green                                                                  |                    |
| [x]  | `features/sessions/use-session-row.ts`  | 28    | `refactor(sessions): settle the sidebar rows`                                           | `useSessionRow`    |

## S4 Settings: MCP

The list's data is on the wire: `McpListView.reach` carries pi's two reaching rules
(defaultTools, autoEnableCodemode, a disabled built-in, a project's own list) and the
servers nothing can call, and `mcpDisabled` says pi's own MCP extension is off.
The add flow is ported, and with it S4's last rows: the reader for a config pasted from
another client (all five wrappers, the kept keys, the refusals, with main's 21 tests), the
four ways in, and the registry browser over the two RPCs.
`settings.mcp.setDefaultTool` writes the home's list; `settings.mcp.command` runs
`/mcp login|logout|reconnect` in a live chat. The server page is ported. What is left:
the list pane with the master/detail layout, then the add flow (dialog, source, values,
import, registry, draft and validation, about 1,800 lines).

Sign-in: the owner's yes (this session) moved invariant 5 from "MCP sign-in stays in the
terminal" to "sign-in runs inside a live chat's engine through pi's own `/mcp` line".
`settings.mcp.command` carries it; `mcp-signin`/`mcp-oauth` port with the editor.

| Done | main file (`client/src/…`)                       | Lines | Branch today                                                     | Missing exports                                                              |
| ---- | ------------------------------------------------ | ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [x]  | `features/settings/mcp/mcp-add-dialog.tsx`       |       | `feat(settings): the MCP add flow`                               |                                                                              | `McpAddDialog`                                                                                                                            |
| [x]  | `features/settings/mcp/mcp-add-source.tsx`       |       | `feat(settings): the MCP add flow`                               |                                                                              | `McpAddSource`, `NameField`                                                                                                               |
| [x]  | `features/settings/mcp/mcp-add-values.tsx`       |       | `feat(settings): the MCP add flow`                               |                                                                              | `McpAddClash`, `McpAddScope`, `McpAddValues`, `TypedValues`                                                                               |
| [x]  | `features/settings/mcp/mcp-advanced.tsx`         | 81    | `feat(settings): the MCP server page`                            | `McpAdvanced`                                                                |
| [x]  | `features/settings/mcp/mcp-connection.tsx`       | 143   | `feat(settings): the MCP server page`                            | `McpConnection`                                                              |
| [x]  | `features/settings/mcp/mcp-detail.ts`            | 25    | `feat(settings): the MCP server page`                            | `asScope`, `isOverrideSubject`, `McpOverrideSubject`, `McpServerEntryDetail` |
| [x]  | `features/settings/mcp/mcp-draft.ts`             | 161   | `feat(settings): the MCP server page`                            | `draftOf`, `ExposureRow`, `inputOf`, `McpDraft`                              |
| [x]  | `features/settings/mcp/mcp-exposure-rows.tsx`    | 83    | `feat(settings): the MCP server page`                            | `McpToolExposureRows`                                                        |
| [x]  | `features/settings/mcp/mcp-exposure-select.tsx`  | 51    | `feat(settings): the MCP server page`                            | `ExposureSelect`                                                             |
| [x]  | `features/settings/mcp/mcp-exposure.ts`          | 16    | `feat(settings): the MCP server page`                            | `exposureItems`, `exposureLabel`                                             |
| [x]  | `features/settings/mcp/mcp-form.tsx`             | 308   | `feat(settings): the MCP server page`                            | `McpEditor`                                                                  |
| [x]  | `features/settings/mcp/mcp-import.ts`            |       | `feat(settings): the MCP add flow`                               |                                                                              | `AddMode`, `Candidate`, `candidatesOf`, `emptySource`, `inputOfCandidate`, `nameProblemOf`, `PasteState`, `previewOfPaste`, `SourceDraft` |
| [x]  | `features/settings/mcp/mcp-oauth.tsx`            | 174   | `feat(settings): the MCP server page`                            | `McpOAuthFields`                                                             |
| [x]  | `features/settings/mcp/mcp-override.tsx`         | 116   | `feat(settings): the MCP server page`                            | `McpOverrideForm`                                                            |
| [x]  | `features/settings/mcp/mcp-panel.tsx`            | 291   | `feat(settings): the MCP list pane` (Add waits for the add flow) |                                                                              | `McpLayout`                                                                                                                               |
| [x]  | `features/settings/mcp/mcp-raw-draft.ts`         | 74    | `feat(settings): the MCP server page`                            | `McpRawDraft`, `useMcpRawDraft`                                              |
| [x]  | `features/settings/mcp/mcp-raw.tsx`              | 22    | `feat(settings): the MCP server page`                            | `McpRawPane`                                                                 |
| [x]  | `features/settings/mcp/mcp-registry-browser.tsx` |       | `feat(settings): the MCP add flow`                               |                                                                              | `McpRegistryBrowser`                                                                                                                      |
| [x]  | `features/settings/mcp/mcp-registry-queries.ts`  |       | `feat(settings): the MCP add flow`                               |                                                                              | `useRegistrySearch`, `useRegistryServer`                                                                                                  |
| [x]  | `features/settings/mcp/mcp-registry-values.tsx`  |       | `feat(settings): the MCP add flow`                               |                                                                              | `McpRegistryValues`                                                                                                                       |
| [x]  | `features/settings/mcp/mcp-registry.ts`          |       | `feat(settings): the MCP add flow`                               |                                                                              | `chosenOption`, `defaultNameOf`, `emptyRegistry`, `missingInputs`, `RegistryDraft`, `serverOf`, `valueOf`                                 |
| [x]  | `features/settings/mcp/mcp-server-card.tsx`      | 37    | `feat(settings): the MCP server page`                            | `McpServerCard`                                                              |
| [x]  | `features/settings/mcp/mcp-signin.tsx`           | 113   | `feat(settings): the MCP server page`                            | `McpSignIn`                                                                  |
| [x]  | `features/settings/mcp/mcp-state.ts`             | 57    | `feat(settings): the MCP server page`                            | `mcpServerState`, `McpServerState`                                           |
| [x]  | `features/settings/mcp/mcp-tools.tsx`            | 176   | `feat(settings): the MCP server page`                            | `McpTools`                                                                   |
| [x]  | `features/settings/mcp/mcp-validation.ts`        | 164   | `feat(settings): the MCP server page`                            | `McpField`, `mcpFieldErrors`, `McpFieldErrors`, `mcpFields`                  |

## S5 Settings: Providers

The list's data is on the wire: `ProvidersView.providers` holds only what a `models.json`
entry or a credential configures, as main did, and `ProvidersView.builtins` holds every
provider pi knows with the sign-in methods it declares, so the add flow offers what
exists. A credential read that fails is a warning in the log and a badge that falls back
to `configured`, not a page that fails. Every row of S5 is ported and photographed
against main, and a `models.json` entry pi cannot compose is listed and opens on the
file's own fields, so it can be fixed without a terminal.

The connection's base-URL warning is main's inline warning paragraph on phase 2's
`Notice` warning tone; the tokens it drops (`mt-0.5 size-4 shrink-0 text-warning`) are
that replacement, not missing markup.

| Done | main file (`client/src/…`)                                  | Lines | Branch today                                                | Missing exports                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------- | ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | `features/settings/providers/add-provider-dialog.tsx`       | 135   | `feat(settings): the add flow`                              | `AddMode`, `AddProviderDialog`                                                                                                                                                                        |
| [x]  | `features/settings/providers/provider-api-select.tsx`       | 71    | `feat(settings): the provider fields' leaves`               | `ProviderApiSelect`                                                                                                                                                                                   |
| [x]  | `features/settings/providers/provider-connection.tsx`       | 221   | `feat(settings): the connection's warning`                  | `ProviderConnection`                                                                                                                                                                                  |
| [x]  | `features/settings/providers/provider-draft.ts`             | 153   | `feat(settings): the provider draft and its rules`          | `draftOf`, `inputOf`, `providerApiUnset`, `ProviderDraft`, `providerIdFromName`, `providerNamesInUse`, `testInputOf`, `uniqueProviderId`                                                              |
| [x]  | `features/settings/providers/provider-editor.tsx`           | 266   | `feat(settings): the provider editor`                       |                                                                                                                                                                                                       |
| [x]  | `features/settings/providers/provider-footer.tsx`           | 33    | `feat(settings): the provider fields' leaves`               | `ProviderActions`                                                                                                                                                                                     |
| [x]  | `features/settings/providers/provider-import-dialog.tsx`    | 136   | `feat(settings): the model import`                          | `ProviderImportDialog`                                                                                                                                                                                |
| [x]  | `features/settings/providers/provider-model-advanced.tsx`   | 204   | `feat(settings): the provider fields' leaves`               | `ModelAdvancedFields`                                                                                                                                                                                 |
| [x]  | `features/settings/providers/provider-model-cost.tsx`       | 112   | `feat(settings): the provider fields' leaves`               | `ModelCostFields`                                                                                                                                                                                     |
| [x]  | `features/settings/providers/provider-model-dialog.tsx`     | 247   | `feat(settings): the model catalog`                         | `ProviderModelDialog`                                                                                                                                                                                 |
| [x]  | `features/settings/providers/provider-model-form.ts`        | 422   | `feat(settings): the provider draft and its rules`          | `completeModelOf`, `costTiersSchema`, `formOf`, `jsonOf`, `ModelField`, `ModelForm`, `ModelMode`, `ModelValue`, `overrideOf`, `samplingByLevelSchema`, `samplingParamsSchema`, `touchedBy`, `valueOf` |
| [x]  | `features/settings/providers/provider-models.tsx`           | 346   | `feat(settings): the model catalog`                         | `ProviderModels`                                                                                                                                                                                      |
| [x]  | `features/settings/providers/provider-reasoning-fields.tsx` | 276   | `feat(settings): the provider fields' leaves`               | `ModelReasoningFields`, `ReasoningCompatFields`                                                                                                                                                       |
| [x]  | `features/settings/providers/provider-sign-in.tsx`          | 487   | `feat(settings): the provider sign-in`                      |                                                                                                                                                                                                       |
| [x]  | `features/settings/providers/provider-test-menu.tsx`        | 84    | `feat(settings): the provider connection and its test menu` | `ProviderTestMenu`                                                                                                                                                                                    |
| [x]  | `features/settings/providers/provider-validation.ts`        | 274   | `feat(settings): the provider draft and its rules`          | `advancedFields`, `ModelField`, `modelFieldErrors`, `ModelFieldErrors`, `modelFields`, `ProviderField`, `providerFieldErrors`, `ProviderFieldErrors`, `providerFields`, `ProviderValidation`          |
| [x]  | `features/settings/providers/providers-panel.tsx`           | 125   | `feat(settings): the add flow`                              |                                                                                                                                                                                                       |
| [x]  | `features/settings/providers/reasoning.ts`                  | 123   | `feat(settings): the provider's reasoning and model form`   | `compatForApi`, `defaultsFor`, `LevelRow`, `ReasoningForm`, `reasoningFormOf`, `reasoningOf`, `THINKING_LEVEL_LABELS`, `THINKING_LEVELS`                                                              |
| [x]  | `features/settings/providers/test-level-select.tsx`         | 57    | `feat(settings): the provider fields' leaves`               | `TestLevelSelect`                                                                                                                                                                                     |

## S6 Settings: Skills

| Done | main file (`client/src/…`)                               | Lines | Branch today                                                                     | Missing exports                                                                 |
| ---- | -------------------------------------------------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [x]  | `features/settings/skills/foreign-skills.tsx`            | 103   | `feat(skills): the folders other agents keep` (parity minus `toneText`)          | `ForeignSkills`                                                                 |
| [x]  | `features/settings/skills/import/candidate-card.tsx`     | 129   | `feat(skills): the import's candidate card` (photographed)                       | `CandidateCard`                                                                 |
| [x]  | `features/settings/skills/import/import-dialog.tsx`      | 88    | `feat(skills): the import's steps, as main wrote them` (photographed)            |                                                                                 |
| [x]  | `features/settings/skills/import/read-folder.ts`         | 125   | `feat(skills): the import's steps, as main wrote them`                           | `archiveProblem`, `checkFolder`, `filesOfDrop`, `filesOfInput`, `PickedFolder`  |
| [x]  | `features/settings/skills/import/review-step.tsx`        | 197   | `feat(skills): the import's steps, as main wrote them` (photographed)            | `ReviewStep`                                                                    |
| [x]  | `features/settings/skills/import/source-step.tsx`        | 222   | `feat(skills): the import's steps, as main wrote them` (photographed)            | `SourceStep`                                                                    |
| [x]  | `features/settings/skills/import/use-skill-import.ts`    | 101   | `feat(skills): the import's steps, as main wrote them`                           | `Staged`                                                                        |
| [x]  | `features/settings/skills/skill-body-checks.ts`          | 48    | `feat(skills): the instructions editor and its marks`                            | `bodyDiagnostics`                                                               |
| [x]  | `features/settings/skills/skill-body-field.tsx`          | 261   | `feat(skills): the instructions editor and its marks` (photographed)             | `BodyReferences`, `SkillBodyField`                                              |
| [x]  | `features/settings/skills/skill-card.tsx`                | 74    | `feat(skills): the skill card and its draft` (photographed)                      | `SkillCard`                                                                     |
| [x]  | `features/settings/skills/skill-delete-entry-dialog.tsx` | 68    | `feat(skills): the raw tab's file tree`                                          | `SkillDeleteEntryDialog`                                                        |
| [x]  | `features/settings/skills/skill-draft.ts`                | 61    | `feat(skills): the skill card and its draft`                                     |                                                                                 |
| [x]  | `features/settings/skills/skill-editor.tsx`              | 52    | `feat(skills): the editor and its page state` (photographed)                     |                                                                                 |
| [x]  | `features/settings/skills/skill-file-dialog.tsx`         | 131   | `feat(skills): the files card` (photographed)                                    | `SkillFileDialog`                                                               |
| [x]  | `features/settings/skills/skill-file-tree.ts`            | 47    | `feat(skills): the raw tab's file tree`                                          | `BundleEntry`, `formatSize`, `languageOf`, `newFileProblem`, `newFolderProblem` |
| [x]  | `features/settings/skills/skill-files-list.tsx`          | 47    | `feat(skills): the files card` (photographed)                                    | `SkillFilesList`                                                                |
| [x]  | `features/settings/skills/skill-files.tsx`               | 138   | `feat(skills): the files card` (photographed)                                    | `SkillFiles`                                                                    |
| [x]  | `features/settings/skills/skill-form.tsx`                | 289   | `feat(skills): the editor and its page state` (photographed: form, raw, guard)   | `SkillPageState`                                                                |
| [x]  | `features/settings/skills/skill-groups.ts`               | 87    | `docs(plan): tick the skill groups and modes` (parity)                           |                                                                                 |
| [x]  | `features/settings/skills/skill-instructions.tsx`        | 30    | `feat(skills): the instructions editor and its marks`                            | `SkillInstructions`                                                             |
| [x]  | `features/settings/skills/skill-loaded-switch.tsx`       | 27    | `feat(skills): the loaded switch and the page's notices` (photographed)          | `LoadedSwitch`                                                                  |
| [x]  | `features/settings/skills/skill-modes.ts`                | 14    | `docs(plan): tick the skill groups and modes` (parity)                           |                                                                                 |
| [x]  | `features/settings/skills/skill-new-entry-dialog.tsx`    | 164   | `feat(skills): the raw tab's file tree` (photographed)                           | `NewEntryKind`, `SkillNewEntryDialog`                                           |
| [x]  | `features/settings/skills/skill-notices.tsx`             | 49    | `feat(skills): the loaded switch and the page's notices` (photographed)          | `SkillNotices`                                                                  |
| [x]  | `features/settings/skills/skill-page-state.ts`           | 36    | `feat(skills): a listed skill's files` (photographed)                            | `useSkillPage`                                                                  |
| [x]  | `features/settings/skills/skill-page.tsx`                | 51    | `feat(skills): a listed skill's files` (parity)                                  |                                                                                 |
| [x]  | `features/settings/skills/skill-path-dialog.tsx`         | 85    | `feat(skills): the skill paths` (photographed: dialog and refusal)               | `SkillPathDialog`                                                               |
| [x]  | `features/settings/skills/skill-paths.tsx`               | 66    | `feat(skills): the skill paths` (photographed: the list and the dialog)          | `SkillPaths`                                                                    |
| [x]  | `features/settings/skills/skill-raw-pane.tsx`            | 84    | `feat(skills): the raw tab's file tree` (photographed)                           | `RawPane`                                                                       |
| [x]  | `features/settings/skills/skill-raw-source.ts`           | 80    | `feat(skills): a listed skill's files` (photographed: the Raw tab and its files) | `RawSource`, `useRawFile`, `useRawFiles`, `useRawSave`                          |
| [x]  | `features/settings/skills/skill-raw.tsx`                 | 282   | `feat(skills): the raw tab's file tree` (photographed)                           |                                                                                 |
| [x]  | `features/settings/skills/skill-references.ts`           | 43    | `feat(skills): a body's links open the skill or file` (photographed)             | `useSkillLinks`                                                                 |
| [x]  | `features/settings/skills/skill-search.ts`               | 25    | `refactor(skills): the skill search schema` (photographed)                       | `skillSearchSchema`                                                             |
| [x]  | `features/settings/skills/skill-starter.ts`              | 14    | identical                                                                        |                                                                                 |
| [x]  | `features/settings/skills/skill-status.ts`               | 41    | `feat(skills): the loaded switch and the page's notices`                         | `isOn`, `readOnlyReason`, `useSkillToggle`                                      |
| [x]  | `features/settings/skills/skill-unreadable.tsx`          | 18    | `feat(skills): a SKILL.md pi cannot parse` (photographed)                        | `SkillUnreadable`                                                               |
| [x]  | `features/settings/skills/skill-viewer.tsx`              | 110   | `feat(skills): a listed skill's files` (photographed)                            |                                                                                 |
| [x]  | `features/settings/skills/skills-panel.tsx`              | 154   | `fix(skills): a home chat's extension skills` (photographed)                     |                                                                                 |

## S7 Settings: Context

| Done | main file (`client/src/…`)                      | Lines | Branch today | Missing exports                                                                                                                  |
| ---- | ----------------------------------------------- | ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `features/settings/context/context-detail.tsx`  | 88    | **missing**  | `ContextSectionPage`                                                                                                             |
| [ ]  | `features/settings/context/context-pages.tsx`   | 284   | **missing**  | `ContextExtensions`, `ContextFiles`, `ContextPackages`, `ContextPrompts`, `ContextSkills`, `ContextSystemPrompt`, `ContextTools` |
| [ ]  | `features/settings/context/context-panel.tsx`   | 87    | **missing**  | `ContextLayout`                                                                                                                  |
| [ ]  | `features/settings/context/context-sections.ts` | 123   | **missing**  | `CONTEXT_SECTIONS`, `contextSection`, `ContextSection`, `ContextSectionId`, `counted`                                            |

The context read has the fault `3929b8a` fixed for skills: on Global it asks for a live
engine in `.epsilon`, where no chat runs. Check it with the backend when this slice starts.

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
