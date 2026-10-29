# A skill name is a path

## Symptom

`GET` and `DELETE /api/settings/skills/<name>` accepted a `name` containing
`../`, and the delete removed a directory outside the agent home's `skills/` root.

## Cause

The settings form validated `name` with `skillInputSchema`, but the two routes
took the URL segment with `z.string().min(1)`. `settings/skills.ts` then joined
the segment onto the skills root, and a joined path with `..` walks out of it. The
module's own comment claimed it removed "nothing outside the skills root", which
was true only for names the form would have sent.

## Fix

`skillNameSchema` is exported from `shared` and used for the route params as well
as the body, so the same rule guards both. `skills.ts` also resolves the directory
and refuses one whose relative path leaves the root, which keeps the guarantee
true for any future caller. The same pattern is applied to provider ids and MCP
names, and to the `new` route collision (a provider id `new` would be shadowed by
the add page).

## Check

`bun run test` in `server/` runs `settings/skills.test.ts`, which writes a real
`SKILL.md` outside the root and asserts that reading and removing `../outside`
throw while the outside file survives. Against a running server,
`curl -X DELETE http://127.0.0.1:3000/api/settings/skills/..%2Foutside` answers
400 with the name rule, not 204.
