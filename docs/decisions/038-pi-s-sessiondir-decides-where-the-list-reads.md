# pi's `sessionDir` decides where the list reads

**Decision**

pi writes a folder's sessions under `<agent>/sessions` unless a settings file names a `sessionDir`, which pi resolves against the folder. The catalog reads pi's own answer for the home's chat folder and for every folder its rows name, and reconciles those roots.

**Why**

Before this, a home or project that moved its sessions had no chats in the dashboard at all (not listed, not openable, not deletable) because the index walked one root. The window line has to follow the same setting. Cost accepted: a folder that moved its sessions is only discoverable from a chat's recorded cwd, so a brand-new session in a custom folder is found on the next list read, which is also when main listed it.

**Rejected**

A second root list the operator maintains by hand. Refusing a custom `sessionDir`.
