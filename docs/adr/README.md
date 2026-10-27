# Architecture decision records

One file per decision a future contributor (human or agent) could reasonably reverse.

| Record                                | Decision                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| [0001](0001-engine-rpc-child.md)      | Drive the `pi` CLI over `--mode rpc`. No embedded session, no durable, no chord. |
| [0002](0002-own-the-ui-contract.md)   | Epsilon owns its UI contract. Render what pi's RPC expresses, never pi's TUI.    |
| [0003](0003-preview-second-origin.md) | Serve agent-written preview content from a second origin.                        |
| [0004](0004-own-the-rpc-driver.md)    | Write our own RPC driver instead of using pi's `RpcClient`.                      |

## Writing one

- `NNNN-short-slug.md`, next number, never reuse.
- Sections: Status, Date, Context, Decision, Consequences, Rejected alternatives, Revisit if.
- **Name the rejected option and why.** The rejected options are what gets re-proposed.
- Amend by adding a new record that supersedes the old one; do not rewrite history.
