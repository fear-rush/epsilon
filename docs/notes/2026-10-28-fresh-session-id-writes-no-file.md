# A fresh `--session-id` writes no file

Date: 2026-10-28

## Symptom

Attaching to an id that does not exist yet returns a snapshot, so the child runs,
but nothing appears on disk: no `~/.pi/agent/sessions/--<project>--/` directory,
no row in `GET /api/sessions`. While chasing this, `pgrep -f <id>` also finds
nothing even though the child answers `get_state`.

## Cause

Two separate things. pi warns `No project session found with id …; creating a new
session with that id` and keeps that session in memory; the JSONL file and its
directory are created on the first appended entry, which is the first message, not
the spawn. And the child rewrites its process title to `pi`, so its command line
no longer carries `--session-id`: matching a child by its session id never works.

## Fix

Nothing in the code; the behaviour is right for a dashboard. An unsaved session
is a session with no list row, and the URL still owns the id, so `/sessions/<id>`
resumes it once pi writes the file. To find the child, use its parent
(`pgrep -P <server pid>`), its title (`pgrep -x pi`), or the pid from `ps`.

## Check

```sh
P=server/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
printf '{"type":"get_state","id":"x1"}\n' | node "$P" --mode rpc --session-id 00000000-0000-4000-8000-000000000000
ls ~/.pi/agent/sessions/            # no directory for that project
```

Send a `prompt` instead of `get_state` and the directory and file appear.
