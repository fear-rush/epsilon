# ADR-0011: Third-party tools ship as dependencies, terminal surfaces are rebuilt

- Status: Accepted
- Date: 2026-10-28

Related: [0006](0006-setup-in-the-deployment-terminal.md) keeps setup in the terminal,
[0008](0008-embed-pi-engine-with-opinions.md) keeps Epsilon's own defaults as code,
[0010](0010-defaults-are-engine-only.md) makes those defaults engine-only.

## Context

A deployment should be worth using on a machine that was never configured. The
operator's own home holds six extensions, and they are not one kind of thing:

- **Tools.** `pi-web-access` (`web_search`, `fetch_content`, `source_check`,
  `get_search_content`) and the tool half of `pi-subagents` (`parallel`, `bg_wait`,
  `contact_supervisor`, …). They need no UI, and they already work in the browser.
- **Commands.** `fff`'s three commands, `pi-context-view`'s `/context`, and the
  subagent commands. They run; only their output can be terminal-shaped.
- **Terminal surfaces.** `fff`'s autocomplete picker, `pi-context-view`'s `custom`
  component, `pi-subagents`' fleet widget, `pi-paster`'s editor component, and the
  operator's `statusbar` footer. None can render in a browser, and none needs to:
  the data they draw is already in the engine.

Two rules constrain what Epsilon may do about the third kind. It does not write pi's
configuration ([0006](0006-setup-in-the-deployment-terminal.md)), and it ships its own
defaults as code rather than vendored files
([0008](0008-embed-pi-engine-with-opinions.md)). `pi install` writes `settings.json` in
the home, so Epsilon cannot install a package for the operator.

What it can do: `DefaultResourceLoader` accepts `additionalExtensionPaths`,
`additionalSkillPaths` and `additionalPromptTemplatePaths`, so a package that is a
dependency of the server can be loaded by path, in-process, with the home untouched.
Both candidate packages declare pi as a peer with `*`, so they do not pin the engine
they run against.

## Decision

1. **Tool packages may become server dependencies.** The first two are
   `pi-web-access` and `pi-subagents`, pinned exactly in `server/package.json` and
   loaded through the loader's additional paths, with the package's skills and
   prompts registered the same way. A tool works the same in every mode, so this is
   the cheap kind of dependency.
2. **A package that is only a terminal surface is not adopted.** The replacement is
   native browser code, written against the engine, not against the package: a
   context meter from `getContextUsage()` and `get_session_stats`, a file picker
   behind `@` (S6), and nothing for a footer.
3. **Image input is a composer feature, not an extension.** pi's `prompt` already
   accepts images; the socket's `prompt` frame carries text only. Adding images to
   that frame and to `agent.prompt()` gives the browser what `pi-paster` gives a
   terminal, and neither surface needs the other.
4. **A package the home already provides is not loaded twice.** `registerTool` keeps
   one map per extension and has no cross-extension duplicate guard, so loading our
   copy beside the operator's would register every tool twice. The engine reads the
   home's `settings.json` package list and skips its own copy of any package named
   there, and the resources view (S8) reports which copy is in use.
5. **The terminal does not get these packages from Epsilon.** Inline and path-loaded
   extensions exist in the server process only, exactly as in
   [0010](0010-defaults-are-engine-only.md). A terminal tab that should have them is
   S7's problem, with the same `-e` mechanism.

## Consequences

- A fresh deployment has web search and subagents with no install step, which is the
  whole point of the deployment owning its home.
- Epsilon becomes a distributor: an upgrade of either package is Epsilon's to test,
  and their peer range is `*`, so a pi upgrade can break them without a version
  change on their side. Both are pinned and carry the same re-verification burden as
  pi itself.
- The image grows by the two packages and their runtime dependencies, about 22 MB
  unpacked today, which is small beside the engine.
- Their TUI parts still report "needs the terminal tab" when used. That notice is now
  the accurate answer rather than a gap, because the browser has its own surfaces for
  the same data.
- Two copies of one package can exist in one deployment: the home's and the server's.
  The skip rule in decision 4 is what keeps that from becoming two tools with one
  name, and it must be checked on every upgrade.
- Licensing and supply chain become Epsilon's: what ships is what a fresh machine
  runs.

## Rejected alternatives

- **Have Epsilon install the packages into the home.** The direct route, and it breaks
  the two rules above: Epsilon writes pi's configuration, and a deployment's package
  set stops being code in the repository.
- **Reimplement every tool natively.** Full control, no third-party weight, and an
  unbounded amount of work reimplementing web fetch, readability extraction and
  subagent orchestration that already exists and is better tested.
- **Leave packages to the operator.** Honest to 0006, and it leaves a fresh machine
  manual, which was the goal this work exists to serve.
- **Build a component bridge so `ctx.ui.custom` renders in the browser.** A TUI
  component protocol carried over a socket, for views whose data the engine already
  exposes directly.

## Revisit if

- A package's tools stop being usable without its TUI, which turns it into a surface
  and removes it from decision 1.
- Dependency weight or upgrade churn starts to exceed what the two tools are worth.
- pi gains a supported way for a host to contribute extensions to a CLI process,
  which would make decision 5 unnecessary.
