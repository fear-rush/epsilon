# Another agent's skill folder is linked, not copied

**Decision**

A folder other agents keep (`~/.claude/skills`, `~/.codex/skills`, a project's `.claude/skills`) is read through pi's own loader and, when linked, its absolute path goes into the `skills` setting of the scope it belongs to. Unlinking removes every entry that names it and nothing else.

**Why**

pi already reads a folder a path names, with the same parser, warnings and reload as a skill under a root. A copy would go stale the moment the other agent edits its skill, and would leave two files with one name. Cost accepted: the page may only link a folder Epsilon detected, so a path pasted or typed into a request is refused.

**Rejected**

Copying the folder into `~/.pi/agent/skills`. A symlink: pi records the folder it read, and a link would still need the same setting entry to be found.
