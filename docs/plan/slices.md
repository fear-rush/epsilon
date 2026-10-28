# Slice checks

Status: **S1, S2 and S3 verified in a browser. S4 is active and only its palette is
left; S11 is queued.** This page holds the
checks. [../plan.md](../plan.md) holds the jobs, the slice table and the risks.

A slice ends when you can run its checks yourself, by hand, in a browser. A slice
is not done because it compiles.

### S1: One live turn

Spawn `pi --mode rpc`, frame its stdout, one WebSocket, a textarea and a raw event
list. Ugly on purpose.

- [x] A prompt sent from the browser streams a real answer back, incrementally
- [x] Kill the child mid-stream: the page reports the agent exited, no silence
- [x] A tool-using turn is recorded and committed to
      `shared/src/conversation/fixtures/`
- [x] `@earendil-works/*` is imported only in `server/src/agent/` and
      `shared/src/pi.ts` (a `grep` proves it; no lint rule exists yet)

### S2: Transcript

Reducer plus renderers, driven by the fixture first, then live.

- [x] A session created in the terminal `pi` is readable in the browser
- [x] On a phone width: no horizontal scrolling, no layout jump while streaming
- [x] A `bash` card shows command and output; an `edit` shows a diff; an image
      result shows the image
- [x] A tool name with no renderer still renders (generic fallback, never blank)
- [x] Replaying a recorded fixture twice yields an identical transcript

### S3: Sessions and resume

- [x] The project's sessions are listed newest first; a pending dialog shows a
      needs-input badge
- [x] Open a session the CLI created, steer it, and the CLI shows the same messages
- [x] Close the tab mid-run, reopen it, and the run has continued
- [x] Deleting a session from the UI removes it from `pi`'s list too

### S4: Composer

Steer, abort, the model picker and `!cmd` are built and verified in a browser. The
palette is built and unverified: a real snapshot carries 63 commands, filtering and
arrow keys are wired, and `Popover` + `Command` came from the registry.

- [x] Steer mid-run and see the message land in the transcript
- [x] Abort, and the run stops in the CLI as well
- [x] Change model; the next turn uses it, and `get_state` in the CLI agrees
      (socket: `set_model` answered ok, the refreshed snapshot is pi's own
      `get_state` with the new model, and a bogus pair answers `Model not found`;
      the menu is now a DropdownMenu in the composer footer)
- [ ] An installed skill or prompt template appears in the palette and runs
      (socket: `get_commands` replies with 63 entries, `source` set to extension,
      prompt or skill; picking writes `/name ` into the composer)
- [x] `!ls` runs a shell command and its output is in the transcript
      (socket and reducer: the reply is followed by a snapshot carrying the
      `bashExecution` message)

### S5: Extension dialogs

- [ ] A permission prompt appears in the browser; approving continues the run
- [ ] A second tab cannot answer the same prompt twice
- [ ] Reload the page while a prompt is pending: it is shown again
- [ ] An extension using `ctx.ui.custom` shows the unsupported notice and points
      at the terminal tab (never silence)

### S6: Files and diff

- [ ] Browse the project tree; open a source file, an image and a CSV
- [ ] A path outside the project is refused with `PATH_NOT_ALLOWED`
- [ ] Open the diff of the file the agent just edited
- [ ] Insert a file path into the composer with `@`

### S7: Terminal

- [ ] `pi` itself runs in the terminal tab; `/login` and `/settings` work, which is
      also how a deployment is configured
- [ ] Resize works, and the touch key row types Esc, Tab and Ctrl+C
- [ ] Closing the tab kills the pty: `pgrep -f pi` shows no orphan

### S8: Resources

- [ ] Skills, packages and MCP servers are listed with scope and source path
- [ ] Install a package in the terminal tab, restart the session, and its tool
      appears in the browser
- [ ] Nothing on this page writes

### S9: Preview

- [ ] Preview an HTML file the agent wrote, from the phone
- [ ] A dev server started by the agent is previewable, and edits hot-reload
- [ ] The previewed page cannot read the API (`fetch` fails from the frame)
- [ ] Preview / Source / Diff tabs agree with each other

### S10: Notifications

- [ ] With a pending prompt and no open tab, a notification arrives on the phone
- [ ] A finished run notifies once, not once per message
- [ ] Opening the notification lands on the right session

### S11: A deployment you can reach from a phone

The container, the volume and the single origin. Details in
[../deploy.md](../deploy.md). Setup inside the container is one `pi` session, not a
feature of the dashboard ([ADR-0006](../adr/0006-setup-in-the-deployment-terminal.md)).

- [ ] One published port serves the client and the API; a page reload works
- [ ] The agent home is the container's volume; the host `~/.pi/agent` is untouched
      (compare a file's mtime before and after a turn)
- [ ] Rebuild the image, restart, and the home, its packages and its sessions are
      still there
- [ ] From the phone over the tunnel, open a session and get a real answer
- [ ] Publishing is bound to loopback: a request from another host on the LAN is
      refused, and the error names the reason
- [ ] `EPSILON_PROJECT` decides the session list, and the agent's `pwd` agrees
- [ ] Deleting the volume and starting over reaches a not-ready notice that names
      the command to run, instead of a broken session
- [ ] The notice names the missing step and the home path; an untrusted project
      shows its own notice rather than a silent downgrade
