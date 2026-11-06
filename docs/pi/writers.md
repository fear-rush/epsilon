# pi reference: Writers

## Writers: what the SDK can and cannot save

| Thing                      | Writer                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default provider and model | `SettingsManager.setDefaultModelAndProvider`, then `flush()`                                                                                                                                                                                                                                                                                                                                                     |
| Other settings             | `SettingsManager` setters (there is none for `defaultTools`, below)                                                                                                                                                                                                                                                                                                                                              |
| Packages                   | `DefaultPackageManager.installAndPersist`, `removeAndPersist`, `listConfiguredPackages`, `update`, `checkForAvailableUpdates`; `SettingsManager.setPackages` and `setProjectPackages` for a filter. Its constructor also takes `builtinExtensions: [name]` and `resolve(async () => "skip")` answers whether a built-in such as `codemode` or `tool-search` is enabled for a folder, without installing anything |
| Project trust              | `ProjectTrustStore.set`                                                                                                                                                                                                                                                                                                                                                                                          |
| Tree labels                | `SessionManager.appendLabelChange(targetId, label)` writes one `label` entry; `undefined` clears it                                                                                                                                                                                                                                                                                                              |
| Providers (`models.json`)  | **none.** `registerProvider()` is runtime-only; `ModelConfig` is read-only                                                                                                                                                                                                                                                                                                                                       |
| MCP servers (`mcp.json`)   | **none reachable.** `addMcpServerConfig`, `removeMcpServerConfig` and `loadMcpConfig` exist, but the package's `exports` map exposes only `.` and `./rpc-entry`, so they cannot be imported through it                                                                                                                                                                                                           |
| Skills                     | **files, plus the `skills` setting.** A skill is a directory with `SKILL.md`; `SettingsManager.setSkillPaths` and `setProjectSkillPaths` write the array of paths and `-path` overrides                                                                                                                                                                                                                          |
| Credentials (`auth.json`)  | `ModelRuntime.login()` and `logout()` for a provider that declares a login method                                                                                                                                                                                                                                                                                                                                |

`ModelRuntime.login(providerId, type, interaction)` drives a whole sign-in and
persists through the credential store; `logout()` removes it. `type` is `"api_key"` or
`"oauth"`, and what a provider offers is on its `auth` field. The interaction is
`prompt()` plus `notify()`: a prompt is `text`, `secret`, `select` (answer with an
option id) or `manual_code`, and a notify is `info`, `auth_url`, `device_code` or
`progress`. `AuthPrompt.signal` lets pi withdraw a question it no longer needs, a
`manual_code` raced against its own callback server, and the host must reject that
prompt. An OAuth flow starts its own callback server on a fixed loopback port, so two
sign-ins for one provider cannot run at the same time. `LoginOptions.getDeviceId` is
read by the providers that name an agent (ChatGPT's); pi's CLI passes
`SettingsManager.getOrCreateDeviceId()`.

`ProviderAuth` declares `apiKey?: ApiKeyAuth` and `oauth?: OAuthAuth`. An API-key
method with `login` asks for the key and for any provider-scoped `env`
(`ApiKeyCredential.env`, such as Cloudflare's account id) through the same prompt
callback, so a host that already relays questions needs nothing special for it;
`apiKey.name` is the label a panel shows. A method without `login` is ambient-only,
so a host has nothing to start and only the environment or a stored key can configure
it.

A custom `models.json` endpoint gets pi's fabricated API-key login, which asks for one
bare key and nothing else, so the dashboard writes that key to `models.json`'s
documented `apiKey` field instead: the field accepts a literal, `$NAME`, or `!command`
output, which the fabricated prompt cannot express.

`auth.json` holds at most one credential per provider, and pi resolves it first: a
stored credential wins over a `models.json` `apiKey` and over the ambient environment.
`getProviderAuthStatus()` names which one it is (`stored`, `runtime`, `environment`,
`models_json_key`, `models_json_command`, `fallback`), with a `label` for the source in
pi's own words (`ANTHROPIC_API_KEY`, `~/.aws/credentials`), and `listCredentials()` is
the non-secret enumeration of `{ providerId, type }`.

Readiness is not a model count. `checkAuth(providerId)` resolves that provider's auth
and returns `{ type, source }`, or `undefined` when it has no credential; it runs the
provider's own side-effect-free `check()` where one exists. `getError()` holds the
composition failure for the whole `models.json` snapshot, and pi's sentence names the
provider it could not build. `pi auth check` maps those to `ready`, `not_ready` and
`invalid`.

Because the flow asks and reports through callbacks, a host without a terminal serves
it with a record per provider: what pi reported, the question it waits on, and an
abort signal, polled by the page. pi also narrates the loopback callback server it
opens, which names a port the operator cannot act on, so those lines are dropped and
the rest of what it reports is shown. Epsilon keeps that record in its providers login
service and writes no `auth.json` of its own; pi exports neither the store nor its
cross-process lock.

`models.json` is parsed with `ModelConfig.load()`, which is read-only. Its provider
fields are documented in pi's `docs/models-configuration.md`: `name`, `baseUrl`,
`apiKey`, `api`, `headers`, `authHeader`, `oauth`, `models`, `modelOverrides`,
`compat` and the per-model extras (`thinkingLevelMap`, `inputLimits`, `promptCache`,
`samplingParams`, `samplingParamsByThinkingLevel`, `headers`). The panel writes
`thinkingLevelMap` and the reasoning subset of `compat` from the model dialog,
provider-wide `compat` from the provider's reasoning defaults, and keeps every
unknown key in both objects. A model
needs only `id`; `input` defaults to `["text"]`, `contextWindow` to 128000 and
`maxTokens` to 16384. `cost` is optional, and when present its four fields are
required; `cost.tiers` is optional. A `modelOverrides` object merges field by field
for object fields such as `cost`; every other field replaces the model's value.
`ModelRuntime.getModels()` returns the composed model, with the stored override
already applied, so the panel seeds its dialog from the runtime's answer rather
than from the file. The runtime's composed model also carries `inputLimits`,
`promptCache`, `samplingParams` and `samplingParamsByThinkingLevel`, but never the
per-model header values: `rawModelHeaders()` applies those from the file. The
extension-facing `ProviderModelConfig` that `registerProvider()` takes has no
`samplingParamsByThinkingLevel`, so a provider registered at runtime cannot set
that field while `models.json` can.
