# Moving a chat into a project is a fork, and the original goes

**Decision**

`sessions.move` hands the file to pi's `SessionManager.forkFrom`: the whole history is written as a new session in the project folder, under a new id, and Epsilon then deletes the old file. The page follows the new id.

**Why**

A session records the folder it ran in, so a plain file rename would leave the chat claiming a folder it is not in, and the project's resources would never load. pi already has the operation that rewrites the folder, and a second copy would only make two rows for one conversation. Cost accepted: `SessionManager` is now one of the pi surfaces `platform/pi.ts` imports (invariant 1), because the fork is a file-level operation and an idle chat has no engine to ask.

**Rejected**

Renaming the file and leaving the recorded folder alone. The old service did that, and nothing used it.
