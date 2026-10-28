# The embedded engine keeps the process alive

## Symptom

A throwaway script that creates an engine, asserts something and calls
`session.dispose()` prints its result and then never exits. The shell command
hangs until it is killed.

## Cause

`dispose()` aborts work and disconnects the session, but the process still holds
handles: MCP transports, extension timers, and the cache warmer. A server is
long-lived and never notices. A one-shot script does.

## Fix

Call `process.exit(0)` at the end of a check script, after `dispose()`. Do not
read a hanging script as a hung engine; engine creation itself measured 669 ms
with the operator's extensions loaded.

## Check

Run a script that creates and disposes an engine with this home. It prints
`ready` within a second, then exits only because of the explicit `process.exit`.
