# `toJsonEvent` is not exported

## Symptom

An embedded host cannot import `toJsonEvent` from
`@earendil-works/pi-coding-agent`, although pi's `docs/json.md` and the library notes
name it as the transform between an `AgentSessionEvent` and the JSON event the
reducer consumes.

```
Cannot find package '@earendil-works/pi-coding-agent' imported from ...
ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './dist/modes/json-event.js'
```

## Cause

`package.json` exports only `.` and `./rpc-entry`. `dist/modes/json-event.js`
exists and `dist/modes/rpc/rpc-mode.js` imports it, but it is a private module.
The package exports the `JsonAgentSessionEvent` type, not the function.

## Fix

`server/src/agent/engine.ts` carries the transform, copied from
`dist/modes/json-event.js`: drop the cumulative `partial` snapshots, and turn
`toolcall_start` into the wire shape with `id` and `toolName`. It is the only
place a live event is narrowed, so an upgrade either keeps the shape or breaks the
type-check here.

## Check

From `server/`:

```sh
node --input-type=module -e "const m = await import('@earendil-works/pi-coding-agent'); console.log('toJsonEvent' in m)"
```

It prints `false`. `server/src/agent/engine.ts` is the copy that remains.
