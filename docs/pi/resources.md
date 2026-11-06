# pi reference: Resources

## Skills

What the dashboard relies on, read from `dist/core/skills.js`, `package-manager.js`
and `resource-loader.js` (1.4.0):

- **Fields pi honors:** `name`, `description` and `disable-model-invocation`. A skill
  without a description is not loaded, and pi reports why. `name` is optional: without
  it pi uses the folder name, and a declared name may differ from the folder with no
  warning at all. A bad name only warns. The body is optional, so frontmatter alone
  loads. `disable-model-invocation: true` keeps the skill out of the system prompt;
  `/skill:name` still runs it. Every other key is parsed and ignored.
- **`enableSkillCommands: false`** removes the `/skill:name` entries from the editor's
  autocomplete and changes nothing else: `prompt()` still expands a typed `/skill:name`.
  pi's setting is read when the engine starts, so a running chat keeps its old palette
  until it reloads.
- **What Epsilon may write**, because pi loads it: a non-empty description of at most
  1024 characters, any text in that description (pi XML-escapes `name`, `description`
  and the path inside `<available_skills>`, so `<`, `>` and `&` are legal), a name
  matching `^[a-z0-9-]+$` with no leading, trailing or double hyphen, and `SKILL.md` as
  the file name. Epsilon refuses a bad name that pi would only warn about.
- **Where skills come from, and who wins:** pi's resolver carries a precedence rank
  and a package skill ranks **last** (`resourcePrecedenceRank` in
  `dist/core/package-manager.js`), so a project or user skill of the same name beats
  it. The sources are entries of the `skills` setting (project, then user),
  `<project>/.pi/skills`, `.agents/skills` in the project and each parent up to the
  git root (trusted projects only), `<agent home>/skills`, then `~/.agents/skills`,
  with packages at the bottom of the order. The `~/.agents/skills` path reads
  `process.env.HOME`, not a value Epsilon passes. The first skill with a name wins;
  each loser gets a `collision` diagnostic with the winner's and loser's paths.
- **The inventory is pi's.** `DefaultPackageManager.resolve()` lists every skill file
  with `enabled` and where it came from; `loadSkills` and `loadSkillsFromDir` parse
  them. `resolve()` installs a missing package unless the `onMissing` callback
  answers `"skip"`, so a read always passes one.
- **Turning one skill off** is a `-<path>` entry in the `skills` array of the file
  that owns the skill's scope. `isEnabledByOverrides` matches the skill's absolute
  directory, its `SKILL.md` path, or either relative to the scope's base folder. A
  package skill is filtered through that package's entry instead.
- **Folders of other agents** (`~/.claude/skills`, `~/.codex/skills`) are not
  scanned. A plain path in the `skills` array adds the folder: any directory, or one
  `.md` file. A file with no frontmatter `name` takes its parent folder's name, which a
  flat file makes an invalid skill name, so give a standalone file a `name`.
- **Skills an extension adds at runtime** come from the `resources_discover` event,
  which returns `skillPaths` (and `promptPaths` and `themePaths`). pi extends the live
  resource loader with them, tagged `source: "extension:<file name>"` and
  `scope: "temporary"`, so `agent.resourceLoader.getSkills()` lists them and
  `resolve()` never does. They exist only inside a live engine.

Prompt templates and themes are resources with the same shape: `resolve()` lists their
files with `enabled` and their source metadata, a path in the `prompts` or `themes`
setting adds a folder or a file, and a `-<file>` entry excludes one. pi's own prompts
and themes folders are discovered under the agent dir and a trusted project's `.pi`. A
prompt template is named after its file without `.md`; its description is the
frontmatter `description`, else the body's first line. A theme is a `.json` file and
pi applies exactly one. The session's `promptTemplates` is what the palette lists, and
`prompt()` expands `/name args` into the message it sends.

## Context files and the system prompt

What pi loads before a request, read from `dist/core/resource-loader.js`
(1.4.0):

- **Context files:** `loadProjectContextFiles({ cwd, agentDir })` is a root export. It
  reads one file per folder, trying `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`,
  `CLAUDE.md`, `CLAUDE.MD` in that order, starting with the agent directory and then
  every ancestor of `cwd` from the root down to `cwd`. They load regardless of project
  trust, so a folder's context files apply before anything is trusted. A nested
  `git worktree` whose own copy shadows the main repository's file is skipped.
  `ResourceLoader.getAgentsFiles()` answers the same list from inside an engine.
- **The system prompt file:** `<cwd>/.pi/SYSTEM.md` when the project is trusted, else
  `<agentDir>/SYSTEM.md`. `APPEND_SYSTEM.md` is discovered the same way, and only one
  of the two is used. Both discoveries are private methods on `DefaultResourceLoader`,
  reachable only by calling `reload()`, which resolves packages with no `onMissing`
  handler and therefore installs a missing one. A reader that must not install
  reproduces the four file checks instead.
- **The prompt itself:** `agent.systemPrompt` is the exact text the model receives,
  extensions' `before_agent_start` substitutions included. `agent.promptTemplates` is
  pi's own parse of the templates, extension-contributed ones included.
- **Frontmatter:** `parseFrontmatter` and `stripFrontmatter` are root exports.
  `loadPromptTemplates` is not, so a reader outside an engine parses a template file
  itself and repeats pi's two fallbacks: the name is the file's without `.md`, and the
  description is the frontmatter `description`, else the body's first line cut at 60
  characters.

## API family paths

pi's clients append a fixed path to a provider's `baseUrl`. Verified against the
clients in the pinned package and the vendors' references (OpenAI API reference,
Anthropic TypeScript SDK, Google Gen AI SDK) on 2026-10-29.

| Family                 | Appended path                     | Model list    | Auth header                   |
| ---------------------- | --------------------------------- | ------------- | ----------------------------- |
| `openai-completions`   | `/chat/completions`               | `/models`     | `Authorization: Bearer <key>` |
| `openai-responses`     | `/responses`                      | `/models`     | `Authorization: Bearer <key>` |
| `anthropic-messages`   | `/v1/messages`                    | `/v1/models`  | `x-api-key` plus a version    |
| `google-generative-ai` | `/models/{model}:generateContent` | different API | `x-goog-api-key`              |

The base URL is not interchangeable between families:

- OpenAI expects the version in the base URL (`https://api.openai.com/v1`), so the
  request is `…/v1/chat/completions`.
- The Anthropic client posts `/v1/messages` relative to its base URL, so a gateway
  with its own `/v1` segment needs the base above it. For commandcode, the OpenAI
  base is `https://api.commandcode.ai/provider/v1` while the Anthropic base is
  `https://api.commandcode.ai/provider`.
- pi sets Google's `apiVersion` to empty when a `baseUrl` is present, so the base
  must include the version path (`https://generativelanguage.googleapis.com/v1beta`).

Epsilon's provider rules mirror this table. The provider form's API
picker labels each family with the path it appends, the base URL field names the
request URL that results, and the model-list fetch reads `modelsPath` from the same
list. A list that carries `supported_endpoints` (commandcode does) is read as a
gateway hint: a `/messages`-only model gets the Anthropic API and a base above its
`/v1`, and a `/responses`-only model gets the Responses API. That keeps one
provider's mixed catalog correct. An exact id and API match in pi's catalog also
supplies `reasoning`, `thinkingLevelMap` and `forceAdaptiveThinking`; the rest of
the gateway's compat is left alone. A base that repeats the family's path is a warning under the field, not a
silent rewrite, because pi calls exactly the base it is given. Its test pins the
commandcode paths.

The model list is not a pi SDK method. The settings panel makes its own bounded
`GET` to the endpoints above, with the typed key or the credential resolved by
`ModelRuntime.getAuth()`, no cross-origin redirects, a ten second timeout and a
response cap. The headers follow the rules pi applies to a request: a provider's
`authHeader` sends the key as `Authorization: Bearer` and wins over the family's
header, a credential header resolved to `null` is suppressed rather than replaced,
and the credential's `baseUrl` and `env` values apply, including the `{NAME}`
placeholders Cloudflare endpoints use. Google's list API is a different shape, so
the panel asks for those models by hand.

The provider test is a pi SDK call instead. It registers the draft with
`ModelRuntime.registerProvider()` on a throwaway runtime, which is runtime-only and
writes no file, then asks `completeSimple()` for a small answer. A typed key or
header overrides the stored one, so the test tries what Save would write, and the
request goes through pi's own client rather than a second wire implementation.

It runs two probes. The keyless one registers a placeholder key, because pi refuses
to stream an unconfigured provider, then suppresses the family's auth header with a
`null` header value so the endpoint sees no key. The keyed one uses the typed or
stored credential. That is how a local or keyless endpoint and a real key are told
apart before Save. A `level` on the request is passed to `completeSimple` as
`reasoning`; the test reads the request payload and a clone of the provider stream,
then reports the field the request carried plus the `reasoning_tokens` or thinking
characters the provider returned.
