# pi reference

What pi exposes to an embedding host and what it does not, read from pi's shipped types and code.

- [embedding.md](embedding.md): how Epsilon embeds pi's SDK, the sources of truth, the session runtime
- [events.md](events.md): the events pi emits and their order
- [writers.md](writers.md): what the SDK can and cannot save
- [resources.md](resources.md): skills, context files and the system prompt, API family paths
- [files.md](files.md): the session files the index reads, the files in the agent home
- [trust.md](trust.md): project trust
- [cli.md](cli.md): what the CLI does that an embedding host does not
- [traps.md](traps.md): facts that surprised us, each with the pi file it was read from
- [upgrading.md](upgrading.md): the procedure for a pi upgrade

If it is not in these files, pi does not expose it (invariant 4).
