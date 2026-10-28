# Assert on the UI, not on the model's prose

## Symptom

Two browser checks for S13 failed while the feature worked. One waited for the text
`Blocked by user`, the other for `User selected: 2. Yolo`. The session file showed
both strings, and the screenshots showed the right result on screen.

## Cause

1. The refusal text the browser shows is not the tool result. The block reason is in
   the payload; the page renders the model's own sentence, which said "blocked by
   you" in one run and "blocked by the user" in the next. Asserting on it asserts on
   the model.
2. A tool result is inside a collapsed `ToolTrace` card. The text exists only after
   the card is expanded, so `getByText` finds nothing while it is closed.

## Fix

Assert on what Epsilon renders: the tool card's own status (`failed`), the composer
control's label (`Strict`), the dialog's options. Expand a card before reading its
result, and treat the result text as the check's subject rather than the evidence.

## Check

The recipe the S13 pass used, with the operator's own dev server left on port 3000:

1. A config in `/tmp` that imports the client's plugins with an explicit `root` and
   proxies `/api` to a check server: `bunx --bun vite --config /tmp/eps-vite.config.ts`
   on port 5210, `ws: true` included or the socket never connects.
2. The check server on 3210 with `EPSILON_AGENT_HOME` set to the scratch home, then
   restarted with an empty home for the not-ready state.
3. Playwright imported from the bun cache
   (`~/.bun/install/cache/playwright@1.64.1@@@1/index.mjs`), Chromium already
   installed, so nothing is added to `package.json` for a one-off check.

Vite binds `localhost` here; `127.0.0.1` did not answer.
