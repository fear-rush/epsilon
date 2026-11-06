# The first-paint bundle is over its budget

`bun run bench` fails one budget: `bundle-size` reads 400.4 KiB against 315 (2026-11-06,
after the transcript, composer and sidebar splits; 392.8 KiB before them), for `/` and
`/sessions/$id`. Every other budget is within. First paint was 310.1 KiB before the chat
port; the 83 KiB over that baseline is the ported chat surface. React (66.8), Effect (51)
and TanStack (38.5) are 156 KiB of the 392 and are the foundation's own cost.

Do: the owner picks one. (a) Defer the palette and the model menu out of first paint
(worth about 21-30 KiB, still short of 78). (b) Set the budget to the branch's own figure
and record the reasoning.
Don't: pick for the owner, or raise the budget to get green.
Done when: `bun run bench` passes.
Stop and ask when: always; the choice is the owner's.
