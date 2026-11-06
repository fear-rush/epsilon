# 09 Copy pass

Every user-facing string in `src/app` checked against `DESIGN.md` → Voice (VO-1…7). Copy
only: no layout, no logic. Evidence: [findings.md → Copy](findings.md#copy).

## Do

1. **Find the strings.** List every string literal of 50+ characters that starts with a
   capital letter in `src/app/**/*.{ts,tsx}` (not tests, not `routeTree.gen.ts`), plus
   every `description`, `placeholder`, `title` and `aria-label` prop value, plus
   `features/settings/general/settings-catalog.ts`. Save the list to
   `.sandbox/copy-pass.md` as `file:line · old · new`.
2. **Rewrite** each one that breaks a VO rule. Patterns:

   | Breaks | Old                                                                                                                              | New                                                                    |
   | ------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
   | VO-3   | How many chats may hold an engine at once; the registry evicts an idle one over this.                                            | Most chats open at once. The oldest idle one closes first.             |
   | VO-3   | Newest first, written by the supervisor when an engine stopped without being asked.                                              | Chats that stopped unexpectedly, newest first.                         |
   | VO-3   | One process per live chat. A chat with none starts a new one on its next message.                                                | (delete)                                                               |
   | VO-3   | Terminal-only calls from live extensions, and what this page uses instead.                                                       | Extension features this page can't show.                               |
   | VO-1/2 | Every folder a chat has run in, with pi's trust decision for it. Epsilon starts nothing in an untrusted folder until you answer. | Folders your chats run in. Untrusted folders ask before anything runs. |
   | VO-2   | A message sent while streaming changes the run. One at a time delivers one and waits; all delivers them at once.                 | Messages sent while the agent works.                                   |
   | VO-2   | This browser refused clipboard access. Select the reply and copy it instead.                                                     | Couldn't copy. Select the text instead.                                |
   | VO-3   | The address names nothing this Epsilon serves. A link from an older build can do it.                                             | Page not found                                                         |
   | —      | Message the agent (/ commands, ! shell, Enter sends, paste or drop images)                                                       | Message the agent…                                                     |

   The composer's hints move to the `/` palette's empty state or a tooltip on the
   attachment button; check `test/e2e/chat.e2e.ts` for selectors that use the placeholder.

3. **Keep warnings that protect data.** A description that warns about credentials,
   deletion or what stays on disk ("A stored credential stays in auth.json; sign out
   before deleting if you want it gone.") is shortened but keeps the warning:
   "Your saved sign-in stays until you sign out."
4. **Settings descriptions** for pi's own settings come from `settings-catalog.ts`. Shorten
   them to one line, but keep the setting's real behaviour; when you are not sure what a
   setting does, look it up in `docs/pi/` and do not guess.

## Don't

- Don't change a string that is pi's or an extension's (it arrives over the wire).
- Don't change a test selector without updating its spec in the same commit.

## Done when

- `.sandbox/copy-pass.md` lists every string with old and new; summarise the count in the
  report.
- A search of `src/app` for "on its own", "cannot explain", "registry", "supervisor",
  "evicts", "terminal-only" finds no user-facing string.
- `bun run lint`, `bun run type-check` and the e2e specs whose words changed pass.
- `bun run shoot` of General, Diagnostics, Projects and an empty chat, read by you.

## Stop and ask when

- A shortened description would hide a risk.
- You cannot tell what a setting does from `docs/pi/` or the code.
