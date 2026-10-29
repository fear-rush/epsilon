# Architecture decision records

One file per decision a future contributor (human or agent) could reasonably reverse.

| Record                                            | Status             | Decision                                                                         |
| ------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| [0001](0001-engine-rpc-child.md)                  | Superseded by 0008 | Drive the `pi` CLI over `--mode rpc`. No embedded session, no durable, no chord. |
| [0002](0002-own-the-ui-contract.md)               | Accepted           | Epsilon owns its UI contract. Render what pi's RPC expresses, never pi's TUI.    |
| [0003](0003-preview-second-origin.md)             | Accepted           | Serve agent-written preview content from a second origin.                        |
| [0004](0004-own-the-rpc-driver.md)                | Superseded by 0008 | Write our own RPC driver instead of using pi's `RpcClient`.                      |
| [0005](0005-deployment-owns-agent-home.md)        | Accepted           | The deployment owns the agent home, at pi's default path, isolated by default.   |
| [0006](0006-setup-in-the-deployment-terminal.md)  | Superseded by 0012 | Setup, login, trust and installs happen in a terminal inside the deployment.     |
| [0007](0007-embed-pi-engine.md)                   | Rejected           | Embed pi's engine in a worker of our own. Rejected: RPC is the cheaper contract. |
| [0008](0008-embed-pi-engine-with-opinions.md)     | Accepted           | Embed pi's engine in the server and ship Epsilon's own default extensions.       |
| [0009](0009-socket-speaks-epsilon.md)             | Accepted           | The socket carries Epsilon's commands and zod shapes, not pi's RPC types.        |
| [0010](0010-defaults-are-engine-only.md)          | Accepted           | The defaults are engine-only; S7 restores parity with `-e`, never by seeding.    |
| [0011](0011-third-party-tools-as-dependencies.md) | Accepted           | Tool packages ship as dependencies; terminal-only surfaces are rebuilt natively. |
| [0012](0012-configure-in-the-dashboard.md)        | Accepted           | The dashboard configures providers, models, MCP, skills and packages.            |

Superseding is how history changes here:

- 0005 narrows 0001's requirement that the machine already has a configured `pi`.
- 0006 kept 0002 decision 5 and moved the terminal it refers to inside the
  deployment. 0012 supersedes 0006: the dashboard now writes pi's documented
  configuration, and only trust, OAuth login and MCP sign-in stay in the terminal.
- 0008 keeps 0002's nine UI methods but they arrive through the SDK's
  `ExtensionUIContext`, not RPC frames.
- 0008 embeds the engine to ship default extensions, so it supersedes 0001
  decision 1 and 0004, and reverses 0007. 0001 decisions 2 to 4 stand.
- 0009 supersedes 0008 decision 2: embedding removed the RPC envelope, so the
  browser contract became Epsilon's own commands and zod shapes.
- 0010 narrows 0008's claim that the defaults behave the same in a terminal: they
  are engine-only until S7 passes them to the CLI with `-e`.
- 0011 accepts third-party package dependencies for their tools and keeps 0008's
  defaults rule. Installation moved to Settings with 0012.

## Writing one

- `NNNN-short-slug.md`, next number, never reuse.
- Sections: Status, Date, Context, Decision, Consequences, Rejected alternatives, Revisit if.
- **Name the rejected option and why.** The rejected options are what gets re-proposed.
- Amend by adding a new record that supersedes the old one; do not rewrite history.
- Status is `Proposed` until the work it describes is decided, `Accepted` once it
  is, `Rejected` when the option was considered and dropped. A rejected record says
  what it would have bought, so the trade is not re-discovered as a win.
