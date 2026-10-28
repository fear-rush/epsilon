# Installed packages are bound to one platform

## Symptom

An agent home prepared on macOS is mounted into a Linux container. `pi list`
reports every package as installed, but the tools they provide fail at call time,
or fail to load at start. Nothing about the home looks wrong.

## Cause

A package's dependency tree is resolved once, for the platform it was installed on.
`@ff-labs/pi-fff` depends on `@ff-labs/fff-node`, whose `optionalDependencies` are
per platform: `@ff-labs/fff-bin-darwin-arm64`, `@ff-labs/fff-bin-linux-x64-gnu`,
`@ff-labs/fff-bin-linux-arm64-musl` and so on, plus `ffi-rs` for the bindings.
Copying or mounting a home does not re-resolve them, so a Darwin install inside a
Linux container has no Linux binary to load.

The same applies in reverse, and to any package with native code.

## Fix

Install packages inside the deployment that runs them: `pi install <source>` in a
shell in that container. Do not carry a home across platforms. This is one of the
reasons [ADR-0005](../adr/0005-deployment-owns-agent-home.md) keeps the home inside
the deployment and refuses a configuration import.

Configuration alone is portable. `settings.json`, `models.json`, `mcp.json`,
`auth.json`, session files, extension and skill files are all text and carry over.
Only the installed dependency trees do not.

## Check

In the container, run `pi list`, then start a session and call a tool the package
registers (`ffind`, for fff). A package installed on the wrong platform lists
correctly and fails at the call.
